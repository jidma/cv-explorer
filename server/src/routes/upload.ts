import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { eq, desc, sql } from 'drizzle-orm';
import { processResume } from '../pipeline';
import { db } from '../db/client';
import { uploads, candidates, uploadCandidates } from '../db/schema';

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

    const records = await db.insert(uploads).values(
      files.map(f => ({
        originalFilename: f.originalname,
        mimeType: mimeMap[path.extname(f.originalname).toLowerCase()] || f.mimetype,
        fileSize: f.size,
        status: 'pending',
        fileData: f.buffer,
      }))
    ).returning({
      id: uploads.id,
      original_filename: uploads.originalFilename,
      status: uploads.status,
      created_at: uploads.createdAt,
    });

    res.json({ uploads: records });
  } catch (err) {
    console.error('Error creating upload records:', err);
    res.status(500).json({ error: 'Failed to create upload records' });
  }
});

// POST /api/uploads/:id/process — process a single upload
router.post('/:id/process', async (req, res) => {
  const { id } = req.params;

  try {
    const [record] = await db
      .select()
      .from(uploads)
      .where(eq(uploads.id, id));

    if (!record) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    if (record.status !== 'pending') {
      return res.status(400).json({ error: `Upload is already ${record.status}` });
    }

    // Mark as processing
    await db.update(uploads)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(uploads.id, id));

    // Write file data to temp file for pipeline
    const ext = path.extname(record.originalFilename).toLowerCase();
    const tmpPath = path.join(os.tmpdir(), `cv-upload-${id}${ext}`);
    fs.writeFileSync(tmpPath, record.fileData!);

    try {
      const result = await processResume(tmpPath, record.originalFilename);

      // Mark upload as completed
      await db.update(uploads)
        .set({
          status: 'completed',
          ingestionCost: result.totalCost.toFixed(6),
          ingestionTokens: result.totalTokens,
          updatedAt: new Date(),
        })
        .where(eq(uploads.id, id));

      // Link upload to candidate via junction table
      await db.insert(uploadCandidates).values({
        uploadId: id,
        candidateId: result.candidateId,
      });

      res.json({
        id,
        status: 'completed',
        candidate_id: result.candidateId,
        ingestion_cost: result.totalCost.toFixed(6),
        ingestion_tokens: result.totalTokens,
      });
    } catch (pipelineErr) {
      const errorMsg = pipelineErr instanceof Error ? pipelineErr.message : 'Processing failed';
      await db.update(uploads)
        .set({
          status: 'error',
          errorMessage: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(uploads.id, id));

      res.json({
        id,
        status: 'error',
        error_message: errorMsg,
      });
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  } catch (err) {
    console.error('Error processing upload:', err);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

// DELETE /api/uploads/:id — remove a pending upload
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
