import { Router } from 'express';
import { pool } from '../db/connection';
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
    const { rows } = await pool.query(
      'SELECT original_document, document_mime_type, original_filename FROM candidates WHERE id = $1',
      [req.params.id]
    );

    if (!rows.length || !rows[0].original_document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { original_document, document_mime_type, original_filename } = rows[0];
    res.setHeader('Content-Type', document_mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${original_filename}"`);
    res.send(original_document);
  } catch (err) {
    console.error('Error fetching document:', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

export default router;
