import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider, calculateCost } from '../llm';
import type { Message, ToolCall, TokenUsage } from '../llm/types';
import { db } from '../db/client';
import { llmCalls } from '../db/schema';
import { searchTools } from './tools';
import { searchBySkills, searchByExperience, searchByEducation, searchByLocation, getCandidateDetail, listAllCandidates } from './structured';
import { semanticSearch } from './semantic';

const SYSTEM_PROMPT = `You are a helpful recruitment assistant with access to a database of candidate CVs/resumes.
When users ask about candidates, use the available tools to search the database and provide helpful, structured answers.

Guidelines:
- Use the most appropriate search tool(s) for the query
- You can call multiple tools if needed to get comprehensive results
- Present results in a clear, readable format
- If no results are found, suggest alternative search criteria
- Always be specific about what you found (names, skills, experience levels)
- When comparing candidates, be objective and reference specific data`;

async function executeToolCall(toolCall: ToolCall): Promise<string> {
  const args = JSON.parse(toolCall.arguments);

  switch (toolCall.name) {
    case 'search_by_skills':
      return JSON.stringify(await searchBySkills(args.skills, args.min_years_experience));
    case 'search_by_experience':
      return JSON.stringify(await searchByExperience(args.job_title, args.min_years, args.company));
    case 'search_by_education':
      return JSON.stringify(await searchByEducation(args.degree, args.field, args.institution));
    case 'search_by_location':
      return JSON.stringify(await searchByLocation(args.location));
    case 'semantic_search':
      return JSON.stringify(await semanticSearch(args.query, args.limit));
    case 'get_candidate_detail':
      return JSON.stringify(await getCandidateDetail(args.candidate_id));
    case 'list_all_candidates':
      return JSON.stringify(await listAllCandidates(args.page, args.limit));
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
  }
}

export interface ChatCost {
  totalCost: number;
  totalTokens: number;
}

export async function chatWithTools(
  userMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (text: string) => void
): Promise<ChatCost> {
  const llm = getLLMProvider();
  const sessionId = uuidv4();
  let totalCost = 0;
  let totalTokens = 0;

  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...userMessages,
  ];

  // Tool use loop — keep calling tools until the LLM generates a final text response
  const MAX_ITERATIONS = 5;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await llm.chat(messages, {
      tools: searchTools,
      maxTokens: 4096,
    });

    // Track cost for this call
    const callCost = calculateCost(response.usage, response.model);
    totalCost += callCost;
    totalTokens += response.usage.totalTokens;

    await logLLMCall(sessionId, 'chat_tool_use', response.model, response.usage, callCost);

    if (response.toolCalls.length === 0) {
      break;
    }

    // Add assistant message WITH tool_calls so providers can serialize them
    messages.push({
      role: 'assistant',
      content: response.content || '',
      toolCalls: response.toolCalls,
    });

    // Execute tool calls and add results
    for (const toolCall of response.toolCalls) {
      const result = await executeToolCall(toolCall);
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });
    }
  }

  // Stream the final response
  const stream = llm.chatStream(messages, {
    tools: searchTools,
    maxTokens: 4096,
  });

  for await (const chunk of stream) {
    if (chunk.type === 'text' && chunk.text) {
      onChunk(chunk.text);
    }
    if (chunk.type === 'done' && chunk.usage && chunk.model) {
      const streamCost = calculateCost(chunk.usage, chunk.model);
      totalCost += streamCost;
      totalTokens += chunk.usage.totalTokens;
      await logLLMCall(sessionId, 'chat_response', chunk.model, chunk.usage, streamCost);
    }
  }

  return { totalCost, totalTokens };
}

async function logLLMCall(
  sessionId: string,
  operation: string,
  model: string,
  usage: TokenUsage,
  cost: number
): Promise<void> {
  try {
    await db.insert(llmCalls).values({
      chatSessionId: sessionId,
      operation,
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cost: cost.toFixed(6),
    });
  } catch (err) {
    console.error('Failed to log LLM call:', err);
  }
}
