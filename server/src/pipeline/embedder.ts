import { getEmbeddingProvider } from '../llm';
import type { ExtractedCV } from 'cv-explorer-shared';

export async function generateEmbedding(cv: ExtractedCV, rawText: string): Promise<number[]> {
  // Build a searchable text from key fields
  const parts: string[] = [];

  if (cv.full_name) parts.push(cv.full_name);
  if (cv.summary) parts.push(cv.summary);
  if (cv.location) parts.push(cv.location);

  for (const exp of cv.experiences) {
    const expParts = [exp.title, exp.company, exp.description].filter(Boolean);
    if (expParts.length) parts.push(expParts.join(' at '));
  }

  for (const edu of cv.education) {
    const eduParts = [edu.degree, edu.field_of_study, edu.institution].filter(Boolean);
    if (eduParts.length) parts.push(eduParts.join(' - '));
  }

  if (cv.skills.length) {
    parts.push('Skills: ' + cv.skills.map(s => s.name).join(', '));
  }

  if (cv.languages.length) {
    parts.push('Languages: ' + cv.languages.map(l => l.name).join(', '));
  }

  const textToEmbed = parts.join('\n').slice(0, 8000); // Stay within token limits

  const provider = getEmbeddingProvider();
  return provider.embed(textToEmbed);
}
