import express from 'express';
import cors from 'cors';
import { config } from './config';
import uploadRoutes from './routes/upload';
import candidateRoutes from './routes/candidates';
import chatRoutes from './routes/chat';
import settingsRoutes from './routes/settings';
import { triggerUploadProcessing } from './uploadWorker';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/uploads', uploadRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${config.port}`);
  // Resume any pending/stalled uploads from previous runs
  triggerUploadProcessing();
});
