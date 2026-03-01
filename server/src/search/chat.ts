import { getLLMProvider } from '../llm';
import type { Message, ToolCall } from '../llm/types';
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

export async function chatWithTools(
  userMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (text: string) => void
): Promise<void> {
  const llm = getLLMProvider();

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

    if (response.toolCalls.length === 0) {
      // No tool calls — stream the final response
      // Re-do as streaming call for final response
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
  }
}
