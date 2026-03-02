import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3035', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5436/cv_explorer',
  llmProvider: (process.env.LLM_PROVIDER || 'openai') as 'openai' | 'anthropic' | 'gemini',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10),
  uploadsDir: path.resolve(__dirname, '../../uploads'),
};
