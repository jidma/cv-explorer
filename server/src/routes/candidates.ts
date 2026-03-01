import { Router } from 'express';
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

export default router;
