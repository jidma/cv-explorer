import { getLLMProvider, calculateCost } from '../llm';
import type { Message, LLMUsageRecord } from '../llm/types';
import type { ExtractedCV } from 'cv-explorer-shared';

const EXTRACTION_PROMPT = `You are a CV/resume data extraction expert. Extract all structured information from the following resume text.

Return a JSON object with this exact structure:
{
  "full_name": "string",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "summary": "brief professional summary or null",
  "experiences": [
    {
      "company": "string",
      "title": "job title",
      "start_date": "YYYY-MM-DD or null",
      "end_date": "YYYY-MM-DD or null",
      "is_current": false,
      "description": "role description or null",
      "location": "string or null"
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string or null",
      "field_of_study": "string or null",
      "start_date": "YYYY-MM-DD or null",
      "end_date": "YYYY-MM-DD or null",
      "description": "string or null"
    }
  ],
  "skills": [
    {
      "name": "skill name",
      "category": null,
      "proficiency": null
    }
  ],
  "languages": [
    {
      "name": "language name",
      "proficiency": "native/fluent/intermediate/basic or null"
    }
  ],
  "certifications": [
    {
      "name": "certification name",
      "issuer": "issuing org or null",
      "issue_date": "YYYY-MM-DD or null"
    }
  ]
}

Rules:
- For dates, use YYYY-MM-DD format. If only a year is given, use YYYY-01-01. If month and year, use YYYY-MM-01.
- If a field is not found in the resume, use null.
- Extract ALL experiences, education entries, skills, languages, and certifications found.
- Return ONLY valid JSON, no markdown or extra text.`;

export async function extractCV(rawText: string): Promise<{ data: ExtractedCV; usage: LLMUsageRecord }> {
  const llm = getLLMProvider();

  const messages: Message[] = [
    { role: 'system', content: EXTRACTION_PROMPT },
    { role: 'user', content: rawText },
  ];

  const response = await llm.chat(messages, {
    temperature: 0,
    maxTokens: 16384,
    responseFormat: 'json',
  });

  if (response.finishReason === 'length') {
    throw new Error('LLM response truncated during extraction — resume may be too long');
  }

  const parsed = JSON.parse(response.content) as ExtractedCV;
  return {
    data: parsed,
    usage: {
      model: response.model,
      usage: response.usage,
      cost: calculateCost(response.usage, response.model),
      operation: 'extraction',
    },
  };
}
