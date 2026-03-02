import { config } from '../config';
import type { LLMProvider } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';

let _provider: LLMProvider | null = null;
let _embeddingProvider: LLMProvider | null = null;

function createProvider(name: string): LLMProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider(config.openaiApiKey);
    case 'anthropic':
      return new AnthropicProvider(config.anthropicApiKey);
    case 'gemini':
      return new GeminiProvider(config.geminiApiKey);
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}

export function getLLMProvider(): LLMProvider {
  if (_provider) return _provider;
  _provider = createProvider(config.llmProvider);
  return _provider;
}

export function getEmbeddingProvider(): LLMProvider {
  if (_embeddingProvider) return _embeddingProvider;
  // Gemini has its own embeddings; Anthropic doesn't, so fall back to OpenAI
  if (config.llmProvider === 'gemini') {
    _embeddingProvider = new GeminiProvider(config.geminiApiKey);
  } else {
    _embeddingProvider = new OpenAIProvider(config.openaiApiKey);
  }
  return _embeddingProvider;
}

/** Switch provider at runtime (resets cached instances) */
export function setLLMProvider(name: 'openai' | 'anthropic' | 'gemini'): void {
  config.llmProvider = name;
  _provider = null;
  _embeddingProvider = null;
  console.log(`[LLM] Provider switched to: ${name}`);
}

/** List providers that have API keys configured */
export function availableProviders(): string[] {
  const providers: string[] = [];
  if (config.openaiApiKey) providers.push('openai');
  if (config.anthropicApiKey) providers.push('anthropic');
  if (config.geminiApiKey) providers.push('gemini');
  return providers;
}

export type { LLMProvider, Message, ChatOptions, ChatResponse, StreamChunk, ToolDefinition, ToolCall, TokenUsage, EmbedResponse, LLMUsageRecord } from './types';
export { calculateCost } from './types';
