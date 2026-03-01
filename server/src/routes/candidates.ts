import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { candidates } from '../db/schema';
import { listAllCandidates, getCandidateDetail } from '../search/structured';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await listAllCandidates(page, limit);
    res.json(result);
  } catch (err) {
    console.error('Error listing candidates:', err);
    res.status(500).json({ error: 'Failed to list candidates' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const candidate = await getCandidateDetail(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    res.json(candidate);
  } catch (err) {
    console.error('Error fetching candidate:', err);
    res.status(500).json({ error: 'Failed to fetch candidate' });
  }
});

router.get('/:id/document', async (req, res) => {
  try {
    const [row] = await db
      .select({
        originalDocument: candidates.originalDocument,
        documentMimeType: candidates.documentMimeType,
        originalFilename: candidates.originalFilename,
      })
      .from(candidates)
      .where(eq(candidates.id, req.params.id));

    if (!row || !row.originalDocument) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.setHeader('Content-Type', row.documentMimeType!);
    res.setHeader('Content-Disposition', `inline; filename="${row.originalFilename}"`);
    res.send(row.originalDocument);
  } catch (err) {
    console.error('Error fetching document:', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

export default router;
