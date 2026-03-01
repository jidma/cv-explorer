import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { uploads, candidates, uploadCandidates } from '../db/schema';
import { triggerUploadProcessing } from '../uploadWorker';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// GET /api/uploads — list recent uploads with linked candidate names
router.get('/', async (_req, res) => {
  try {
    // Fetch uploads with aggregated candidate names via subquery
    const rows = await db
      .select({
        id: uploads.id,
        original_filename: uploads.originalFilename,
        mime_type: uploads.mimeType,
        file_size: uploads.fileSize,
        status: uploads.status,
        error_message: uploads.errorMessage,
        ingestion_cost: uploads.ingestionCost,
        ingestion_tokens: uploads.ingestionTokens,
        created_at: uploads.createdAt,
      })
      .from(uploads)
      .orderBy(desc(uploads.createdAt))
      .limit(30);

    // Fetch candidate links for these uploads
    const uploadIds = rows.map(r => r.id);
    let candidateLinks: Array<{ uploadId: string; candidateId: string; candidateName: string }> = [];

    if (uploadIds.length > 0) {
      candidateLinks = await db
        .select({
          uploadId: uploadCandidates.uploadId,
          candidateId: uploadCandidates.candidateId,
          candidateName: candidates.fullName,
        })
        .from(uploadCandidates)
        .innerJoin(candidates, eq(uploadCandidates.candidateId, candidates.id))
        .where(sql`${uploadCandidates.uploadId} IN (${sql.join(uploadIds.map(id => sql`${id}`), sql`, `)})`);
    }

    // Merge candidate info into upload records
    const linksByUpload = new Map<string, Array<{ candidate_id: string; candidate_name: string }>>();
    for (const link of candidateLinks) {
      if (!linksByUpload.has(link.uploadId)) linksByUpload.set(link.uploadId, []);
      linksByUpload.get(link.uploadId)!.push({
        candidate_id: link.candidateId,
        candidate_name: link.candidateName,
      });
    }

    const result = rows.map(r => ({
      ...r,
      candidates: linksByUpload.get(r.id) ?? [],
    }));

    res.json({ uploads: result });
  } catch (err) {
    console.error('Error listing uploads:', err);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// POST /api/uploads — batch create upload records
router.post('/', upload.array('resume', 10), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  try {
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    // Compute MD5 hash for each file
    const filesWithHash = files.map(f => ({
      file: f,
      hash: crypto.createHash('md5').update(f.buffer).digest('hex'),
    }));

    // Check for existing hashes
    const hashes = filesWithHash.map(f => f.hash);
    const existing = await db
      .select({ fileHash: uploads.fileHash })
      .from(uploads)
      .where(inArray(uploads.fileHash, hashes));
    const existingHashes = new Set(existing.map(r => r.fileHash));

    // Split into new and skipped
    const newFiles = filesWithHash.filter(f => !existingHashes.has(f.hash));
    const skipped = filesWithHash
      .filter(f => existingHashes.has(f.hash))
      .map(f => f.file.originalname);

    let records: Array<{ id: string; original_filename: string; status: string; created_at: Date }> = [];

    if (newFiles.length > 0) {
      records = await db.insert(uploads).values(
        newFiles.map(({ file: f, hash }) => ({
          originalFilename: f.originalname,
          mimeType: mimeMap[path.extname(f.originalname).toLowerCase()] || f.mimetype,
          fileSize: f.size,
          status: 'pending',
          fileData: f.buffer,
          fileHash: hash,
        }))
      ).returning({
        id: uploads.id,
        original_filename: uploads.originalFilename,
        status: uploads.status,
        created_at: uploads.createdAt,
      });

      // Trigger server-side background processing
      triggerUploadProcessing();
    }

    res.json({ uploads: records, skipped });
  } catch (err) {
    console.error('Error creating upload records:', err);
    res.status(500).json({ error: 'Failed to create upload records' });
  }
});

// POST /api/uploads/:id/retry — retry a failed upload
router.post('/:id/retry', async (req, res) => {
  try {
    const [record] = await db
      .select({ status: uploads.status })
      .from(uploads)
      .where(eq(uploads.id, req.params.id));

    if (!record) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    if (record.status !== 'error') {
      return res.status(400).json({ error: 'Can only retry failed uploads' });
    }

    await db.update(uploads)
      .set({ status: 'pending', errorMessage: null, updatedAt: new Date() })
      .where(eq(uploads.id, req.params.id));

    triggerUploadProcessing();

    res.json({ ok: true });
  } catch (err) {
    console.error('Error retrying upload:', err);
    res.status(500).json({ error: 'Failed to retry upload' });
  }
});

// DELETE /api/uploads/:id — remove an upload
router.delete('/:id', async (req, res) => {
  try {
    const [record] = await db
      .select({ status: uploads.status })
      .from(uploads)
      .where(eq(uploads.id, req.params.id));

    if (!record) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    if (record.status === 'processing') {
      return res.status(400).json({ error: 'Cannot delete while processing' });
    }

    await db.delete(uploads).where(eq(uploads.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting upload:', err);
    res.status(500).json({ error: 'Failed to delete upload' });
  }
});

export default router;
