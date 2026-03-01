import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { candidates } from '../db/schema';
import { listAllCandidates, getCandidateDetail, getFilterOptions, listFilteredCandidates, CandidateFilters } from '../search/structured';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const filters: CandidateFilters = {
      skill: (req.query.skill as string) || undefined,
      location: (req.query.location as string) || undefined,
      title: (req.query.title as string) || undefined,
      degree: (req.query.degree as string) || undefined,
    };

    const hasFilters = Object.values(filters).some(v => v);
    const result = hasFilters
      ? await listFilteredCandidates(filters, page, limit)
      : await listAllCandidates(page, limit);

    res.json(result);
  } catch (err) {
    console.error('Error listing candidates:', err);
    res.status(500).json({ error: 'Failed to list candidates' });
  }
});

router.get('/filters', async (_req, res) => {
  try {
    const options = await getFilterOptions();
    res.json(options);
  } catch (err) {
    console.error('Error fetching filter options:', err);
    res.status(500).json({ error: 'Failed to fetch filter options' });
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
