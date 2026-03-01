import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { processResume } from '../pipeline';

const router = Router();

// Ensure uploads directory exists
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: config.uploadsDir,
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
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

router.post('/', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Process asynchronously — respond immediately with status
    const filePath = req.file.path;
    const originalFilename = req.file.originalname;

    const result = await processResume(filePath, originalFilename);

    res.json({
      candidateId: result.candidateId,
      status: 'completed',
      message: `Resume processed successfully: ${originalFilename}`,
      cost: {
        total: result.totalCost,
        tokens: result.totalTokens,
        breakdown: result.calls.map(c => ({
          operation: c.operation,
          model: c.model,
          tokens: c.usage.totalTokens,
          cost: c.cost,
        })),
      },
    });
  } catch (err) {
    console.error('Upload processing error:', err);
    res.status(500).json({
      status: 'error',
      message: err instanceof Error ? err.message : 'Processing failed',
    });
  }
});

export default router;
