import express from 'express';
import cors from 'cors';
import { config } from './config';
import uploadRoutes from './routes/upload';
import candidateRoutes from './routes/candidates';
import chatRoutes from './routes/chat';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
