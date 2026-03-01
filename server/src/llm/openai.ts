import OpenAI from 'openai';
import type { LLMProvider, Message, ChatOptions, ChatResponse, StreamChunk, ToolDefinition, EmbedResponse } from './types';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel = 'gpt-4o';
  private embeddingModel = 'text-embedding-3-small';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<ChatResponse> {
    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: options.model || this.defaultModel,
      messages: this.toOpenAIMessages(messages),
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4096,
    };

    if (options.tools?.length) {
      params.tools = this.toOpenAITools(options.tools);
    }

    if (options.responseFormat === 'json') {
      params.response_format = { type: 'json_object' };
    }

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];
    const model = response.model || options.model || this.defaultModel;

    return {
      content: choice.message.content || '',
      toolCalls: (choice.message.tool_calls || []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : choice.finish_reason === 'length' ? 'length' : 'stop',
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      model,
    };
  }

  async *chatStream(messages: Message[], options: ChatOptions = {}): AsyncIterable<StreamChunk> {
    const params: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: options.model || this.defaultModel,
      messages: this.toOpenAIMessages(messages),
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options.tools?.length) {
      params.tools = this.toOpenAITools(options.tools);
    }

    const stream = await this.client.chat.completions.create(params);
    const model = options.model || this.defaultModel;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield { type: 'text', text: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            yield {
              type: 'tool_call_start',
              toolCall: { id: tc.id, name: tc.function.name, arguments: '' },
            };
          }
          if (tc.function?.arguments) {
            yield {
              type: 'tool_call_delta',
              toolCall: { arguments: tc.function.arguments },
            };
          }
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        const usage = chunk.usage ? {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        } : undefined;
        yield { type: 'done', usage, model };
      }
    }
  }

  async embed(text: string): Promise<EmbedResponse> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });
    return {
      embedding: response.data[0].embedding,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: 0,
        totalTokens: response.usage.total_tokens,
      },
      model: this.embeddingModel,
    };
  }

  private toOpenAIMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    for (const m of messages) {
      if (m.role === 'tool') {
        result.push({
          role: 'tool',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          tool_call_id: m.tool_call_id!,
        });
      } else if (m.role === 'system') {
        result.push({
          role: 'system',
          content: typeof m.content === 'string' ? m.content : m.content.map(p => p.text || '').join('\n'),
        });
      } else if (m.role === 'assistant') {
        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: typeof m.content === 'string' ? m.content : m.content.map(p => p.text || '').join(''),
        };
        if (m.toolCalls?.length) {
          assistantMsg.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          }));
        }
        result.push(assistantMsg);
      } else {
        // user
        if (Array.isArray(m.content)) {
          result.push({
            role: 'user',
            content: m.content.map(part => {
              if (part.type === 'image_url') {
                return { type: 'image_url' as const, image_url: { url: part.image_url!.url } };
              }
              return { type: 'text' as const, text: part.text || '' };
            }),
          });
        } else {
          result.push({ role: 'user', content: m.content });
        }
      }
    }

    return result;
  }

  private toOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}
