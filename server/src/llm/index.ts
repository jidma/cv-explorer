import { config } from '../config';
import type { LLMProvider } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';

let _provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (_provider) return _provider;

  switch (config.llmProvider) {
    case 'openai':
      _provider = new OpenAIProvider(config.openaiApiKey);
      break;
    case 'anthropic':
      _provider = new AnthropicProvider(config.anthropicApiKey);
      break;
    default:
      throw new Error(`Unknown LLM provider: ${config.llmProvider}`);
  }

  return _provider;
}

// For embeddings, always use OpenAI (Anthropic doesn't have native embeddings)
let _embeddingProvider: LLMProvider | null = null;

export function getEmbeddingProvider(): LLMProvider {
  if (_embeddingProvider) return _embeddingProvider;
  _embeddingProvider = new OpenAIProvider(config.openaiApiKey);
  return _embeddingProvider;
}

export type { LLMProvider, Message, ChatOptions, ChatResponse, StreamChunk, ToolDefinition, ToolCall, TokenUsage, EmbedResponse, LLMUsageRecord } from './types';
export { calculateCost } from './types';
