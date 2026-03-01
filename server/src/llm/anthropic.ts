import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, Message, ChatOptions, ChatResponse, StreamChunk, ToolDefinition } from './types';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel = 'claude-sonnet-4-20250514';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<ChatResponse> {
    const { systemMessage, userMessages } = this.splitSystem(messages);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens ?? 4096,
      messages: this.toAnthropicMessages(userMessages),
    };

    if (systemMessage) {
      params.system = systemMessage;
    }

    if (options.tools?.length) {
      params.tools = this.toAnthropicTools(options.tools);
    }

    const response = await this.client.messages.create(params);

    const textContent = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({
        id: b.id,
        name: b.name,
        arguments: JSON.stringify(b.input),
      }));

    return {
      content: textContent,
      toolCalls,
      finishReason: response.stop_reason === 'tool_use' ? 'tool_calls' : response.stop_reason === 'max_tokens' ? 'length' : 'stop',
    };
  }

  async *chatStream(messages: Message[], options: ChatOptions = {}): AsyncIterable<StreamChunk> {
    const { systemMessage, userMessages } = this.splitSystem(messages);

    const params: Anthropic.MessageCreateParamsStreaming = {
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens ?? 4096,
      messages: this.toAnthropicMessages(userMessages),
      stream: true,
    };

    if (systemMessage) {
      params.system = systemMessage;
    }

    if (options.tools?.length) {
      params.tools = this.toAnthropicTools(options.tools);
    }

    const stream = this.client.messages.stream(params);

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          yield {
            type: 'tool_call_start',
            toolCall: { id: event.content_block.id, name: event.content_block.name, arguments: '' },
          };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          yield {
            type: 'tool_call_delta',
            toolCall: { arguments: event.delta.partial_json },
          };
        }
      } else if (event.type === 'message_stop') {
        yield { type: 'done' };
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    // Anthropic doesn't have a native embedding API — use Voyage AI or fall back.
    // For now, throw an error suggesting to use OpenAI for embeddings.
    throw new Error(
      'Anthropic does not provide an embedding API. ' +
      'Set LLM_PROVIDER=openai for embeddings, or implement a Voyage AI adapter.'
    );
  }

  private splitSystem(messages: Message[]): { systemMessage: string | undefined; userMessages: Message[] } {
    const systemMsgs = messages.filter(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');
    const systemMessage = systemMsgs.length > 0
      ? systemMsgs.map(m => typeof m.content === 'string' ? m.content : '').join('\n')
      : undefined;
    return { systemMessage, userMessages };
  }

  private toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [{
            type: 'tool_result' as const,
            tool_use_id: m.tool_call_id!,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }],
        };
      }

      // Assistant message with tool calls — emit tool_use content blocks
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const content: Anthropic.ContentBlockParam[] = [];
        if (typeof m.content === 'string' && m.content) {
          content.push({ type: 'text' as const, text: m.content });
        }
        for (const tc of m.toolCalls) {
          content.push({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments),
          });
        }
        return { role: 'assistant' as const, content };
      }

      if (Array.isArray(m.content)) {
        return {
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content.map(part => {
            if (part.type === 'image_url' && part.image_url) {
              const match = part.image_url.url.match(/^data:(.*?);base64,(.*)$/);
              if (match) {
                return {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                    data: match[2],
                  },
                };
              }
            }
            return { type: 'text' as const, text: part.text || '' };
          }),
        };
      }

      return {
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content as string,
      };
    });
  }

  private toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }));
  }
}
