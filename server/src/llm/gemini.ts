import { GoogleGenAI, type Content, type Part, type FunctionDeclaration, type GenerateContentResponse } from '@google/genai';
import type { LLMProvider, Message, ChatOptions, ChatResponse, StreamChunk, ToolDefinition, EmbedResponse } from './types';

export class GeminiProvider implements LLMProvider {
  private ai: GoogleGenAI;
  private defaultModel = 'gemini-2.5-flash';
  private chatModel = 'gemini-2.5-pro';
  private embeddingModel = 'gemini-embedding-001';

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<ChatResponse> {
    // Use pro model for chat (when tools are present), flash for ingestion
    const model = options.model || (options.tools?.length ? this.chatModel : this.defaultModel);
    const { systemInstruction, contents } = this.toGeminiMessages(messages);

    const response = await this.ai.models.generateContent({
      model,
      contents,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        temperature: options.temperature ?? 0.1,
        maxOutputTokens: options.maxTokens ?? 4096,
        ...(options.tools?.length ? { tools: [{ functionDeclarations: this.toGeminiTools(options.tools) }] } : {}),
        ...(options.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
      },
    });

    const functionCalls = response.functionCalls ?? [];
    const toolCalls = functionCalls.map((fc, i) => ({
      id: `call_${i}_${Date.now()}`,
      name: fc.name!,
      arguments: JSON.stringify(fc.args ?? {}),
    }));

    const usage = response.usageMetadata;
    const finishReason = functionCalls.length > 0 ? 'tool_calls' as const
      : (response.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'length' as const : 'stop' as const);

    return {
      content: response.text ?? '',
      toolCalls,
      finishReason,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      model,
    };
  }

  async *chatStream(messages: Message[], options: ChatOptions = {}): AsyncIterable<StreamChunk> {
    const model = options.model || (options.tools?.length ? this.chatModel : this.defaultModel);
    const { systemInstruction, contents } = this.toGeminiMessages(messages);

    const response = await this.ai.models.generateContentStream({
      model,
      contents,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        temperature: options.temperature ?? 0.1,
        maxOutputTokens: options.maxTokens ?? 4096,
        ...(options.tools?.length ? { tools: [{ functionDeclarations: this.toGeminiTools(options.tools) }] } : {}),
      },
    });

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        yield { type: 'text', text };
      }

      // Track usage from each chunk
      if (chunk.usageMetadata) {
        totalPromptTokens = chunk.usageMetadata.promptTokenCount ?? totalPromptTokens;
        totalCompletionTokens = chunk.usageMetadata.candidatesTokenCount ?? totalCompletionTokens;
      }

      // Check for function calls in stream
      const fcs = chunk.functionCalls;
      if (fcs?.length) {
        for (let i = 0; i < fcs.length; i++) {
          const fc = fcs[i];
          yield {
            type: 'tool_call_start',
            toolCall: { id: `call_${i}_${Date.now()}`, name: fc.name!, arguments: JSON.stringify(fc.args ?? {}) },
          };
        }
      }

      // Check for finish
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason) {
        yield {
          type: 'done',
          usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
          },
          model,
        };
      }
    }
  }

  async embed(text: string): Promise<EmbedResponse> {
    const response = await this.ai.models.embedContent({
      model: this.embeddingModel,
      contents: text,
      config: { outputDimensionality: 1536 },
    });

    const embedding = response.embeddings?.[0]?.values ?? [];

    return {
      embedding,
      usage: {
        promptTokens: text.split(/\s+/).length, // approximate
        completionTokens: 0,
        totalTokens: text.split(/\s+/).length,
      },
      model: this.embeddingModel,
    };
  }

  private toGeminiMessages(messages: Message[]): { systemInstruction?: string; contents: Content[] } {
    let systemInstruction: string | undefined;
    const contents: Content[] = [];

    for (const m of messages) {
      if (m.role === 'system') {
        // Accumulate system messages
        const text = typeof m.content === 'string' ? m.content : m.content.map(p => p.text || '').join('\n');
        systemInstruction = systemInstruction ? `${systemInstruction}\n${text}` : text;
        continue;
      }

      if (m.role === 'tool') {
        // Tool results go as user messages with functionResponse parts
        // Find the tool name from the tool_call_id by looking at previous assistant message
        const toolName = this.findToolName(messages, m.tool_call_id!);
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: toolName,
              response: JSON.parse(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
            },
          }],
        });
        continue;
      }

      if (m.role === 'assistant') {
        const parts: Part[] = [];
        // Text content
        const text = typeof m.content === 'string' ? m.content : m.content.map(p => p.text || '').join('');
        if (text) {
          parts.push({ text });
        }
        // Tool calls
        if (m.toolCalls?.length) {
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: JSON.parse(tc.arguments),
              },
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
        continue;
      }

      // User message
      if (Array.isArray(m.content)) {
        const parts: Part[] = m.content.map(part => {
          if (part.type === 'image_url' && part.image_url) {
            const match = part.image_url.url.match(/^data:(.*?);base64,(.*)$/);
            if (match) {
              return { inlineData: { mimeType: match[1], data: match[2] } };
            }
          }
          return { text: part.text || '' };
        });
        contents.push({ role: 'user', parts });
      } else {
        contents.push({ role: 'user', parts: [{ text: m.content }] });
      }
    }

    return { systemInstruction, contents };
  }

  private findToolName(messages: Message[], toolCallId: string): string {
    for (const m of messages) {
      if (m.role === 'assistant' && m.toolCalls) {
        const tc = m.toolCalls.find(t => t.id === toolCallId);
        if (tc) return tc.name;
      }
    }
    return 'unknown';
  }

  private toGeminiTools(tools: ToolDefinition[]): FunctionDeclaration[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as FunctionDeclaration['parameters'],
    }));
  }
}
