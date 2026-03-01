import { getLLMProvider, calculateCost } from '../llm';
import type { Message, LLMUsageRecord } from '../llm/types';
import type { ExtractedCV } from 'cv-explorer-shared';

const ENRICHMENT_PROMPT = `You are a data normalization expert for HR/recruitment data.
Given a structured CV in JSON format, normalize and enrich it:

1. **Skills**: Categorize each skill into one of: "programming_language", "framework", "database", "cloud", "devops", "tool", "methodology", "soft_skill", "other". Standardize names (e.g., "JS" → "JavaScript", "k8s" → "Kubernetes").

2. **Job titles**: Standardize to common forms (e.g., "Sr. Dev" → "Senior Developer", "SWE" → "Software Engineer").

3. **Proficiency**: For skills where proficiency can be inferred from context (e.g., listed under "Expert" section), set it to "expert", "advanced", "intermediate", or "beginner".

Return the same JSON structure with the enriched data. Return ONLY valid JSON.`;

export async function enrichCV(extracted: ExtractedCV): Promise<{ data: ExtractedCV; usage: LLMUsageRecord }> {
  const llm = getLLMProvider();

  const messages: Message[] = [
    { role: 'system', content: ENRICHMENT_PROMPT },
    { role: 'user', content: JSON.stringify(extracted, null, 2) },
  ];

  const response = await llm.chat(messages, {
    temperature: 0,
    maxTokens: 8192,
    responseFormat: 'json',
  });

  if (response.finishReason === 'length') {
    throw new Error('LLM response truncated during enrichment — resume may be too long');
  }

  const enriched = JSON.parse(response.content) as ExtractedCV;
  return {
    data: enriched,
    usage: {
      model: response.model,
      usage: response.usage,
      cost: calculateCost(response.usage, response.model),
      operation: 'enrichment',
    },
  };
}
