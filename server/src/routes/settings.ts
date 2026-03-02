import { Router } from 'express';
import { config } from '../config';
import { setLLMProvider, availableProviders } from '../llm';

const router = Router();

// GET /api/settings — current provider and available providers
router.get('/', (_req, res) => {
  res.json({
    provider: config.llmProvider,
    availableProviders: availableProviders(),
  });
});

// POST /api/settings/provider — switch LLM provider at runtime
router.post('/provider', (req, res) => {
  const { provider } = req.body;
  const valid = ['openai', 'anthropic', 'gemini'] as const;

  if (!valid.includes(provider)) {
    return res.status(400).json({ error: `Invalid provider. Must be one of: ${valid.join(', ')}` });
  }

  const available = availableProviders();
  if (!available.includes(provider)) {
    return res.status(400).json({ error: `Provider "${provider}" is not configured (missing API key)` });
  }

  setLLMProvider(provider);
  res.json({ provider: config.llmProvider });
});

export default router;
