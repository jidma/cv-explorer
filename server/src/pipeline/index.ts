import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { experiences, education, skills, languages, certifications, llmCalls } from '../db/schema';
import { calculateCost } from '../llm';
import type { LLMUsageRecord } from '../llm/types';
import { parseResume } from './parser';
import { extractCV } from './extractor';
import { enrichCV } from './enricher';
import { generateEmbedding } from './embedder';
import type { ExtractedCV } from 'cv-explorer-shared';

/** Validate a date string — return null if not a valid YYYY-MM-DD date */
function sanitizeDate(d: string | null | undefined): string | null {
  if (!d) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return null;
  return d;
}

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export interface PipelineResult {
  candidateId: string;
  totalCost: number;
  totalTokens: number;
  calls: LLMUsageRecord[];
}

export async function processResume(filePath: string, originalFilename: string): Promise<PipelineResult> {
  console.log(`[Pipeline] Starting processing: ${originalFilename}`);
  const calls: LLMUsageRecord[] = [];

  // Read original file bytes for storage
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(originalFilename).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  const pipelineStart = Date.now();

  // Step 1: Parse
  console.log('[Pipeline] Step 1/5: Parsing document...');
  let stepStart = Date.now();
  const rawText = await parseResume(filePath);
  console.log(`[Pipeline] Parsed ${rawText.length} chars in ${Date.now() - stepStart}ms`);

  // Step 2: Extract
  console.log('[Pipeline] Step 2/5: Extracting structured data via LLM...');
  stepStart = Date.now();
  const extraction = await extractCV(rawText);
  calls.push(extraction.usage);
  console.log(`[Pipeline] Extracted in ${Date.now() - stepStart}ms (${extraction.usage.model}, ${extraction.usage.usage.totalTokens} tokens, $${extraction.usage.cost.toFixed(6)})`);
  console.log(`[Pipeline]   → ${extraction.data.full_name} | ${extraction.data.experiences?.length ?? 0} exp, ${extraction.data.skills?.length ?? 0} skills`);

  // Validate: must have at least a name
  if (!extraction.data.full_name?.trim()) {
    throw new Error('Could not extract a candidate name — file may not be a resume');
  }

  // Step 3: Enrich
  console.log('[Pipeline] Step 3/5: Enriching & normalizing via LLM...');
  stepStart = Date.now();
  const enrichment = await enrichCV(extraction.data);
  calls.push(enrichment.usage);
  console.log(`[Pipeline] Enriched in ${Date.now() - stepStart}ms (${enrichment.usage.model}, ${enrichment.usage.usage.totalTokens} tokens, $${enrichment.usage.cost.toFixed(6)})`);

  // Step 4: Embed
  console.log('[Pipeline] Step 4/5: Generating embedding...');
  stepStart = Date.now();
  const embedResult = await generateEmbedding(enrichment.data, rawText);
  const embedUsage: LLMUsageRecord = {
    model: embedResult.model,
    usage: embedResult.usage,
    cost: calculateCost(embedResult.usage, embedResult.model),
    operation: 'embedding',
  };
  calls.push(embedUsage);
  console.log(`[Pipeline] Embedded in ${Date.now() - stepStart}ms (${embedResult.model}, ${embedResult.usage.totalTokens} tokens, $${embedUsage.cost.toFixed(6)})`);

  // Totals
  const totalCost = calls.reduce((sum, c) => sum + c.cost, 0);
  const totalTokens = calls.reduce((sum, c) => sum + c.usage.totalTokens, 0);

  // Step 5: Store
  console.log('[Pipeline] Step 5/5: Storing in database...');
  stepStart = Date.now();
  const candidateId = await storeCandidate(
    enrichment.data, rawText, originalFilename,
    embedResult.embedding, fileBuffer, mimeType,
    totalCost, totalTokens, calls
  );
  console.log(`[Pipeline] Stored in ${Date.now() - stepStart}ms`);

  const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  console.log(`[Pipeline] Done in ${elapsed}s | ${originalFilename} → ${enrichment.data.full_name} (${candidateId}) | $${totalCost.toFixed(6)} | ${totalTokens} tokens`);
  return { candidateId, totalCost, totalTokens, calls };
}

async function storeCandidate(
  cv: ExtractedCV,
  rawText: string,
  originalFilename: string,
  embedding: number[],
  documentBuffer: Buffer,
  documentMimeType: string,
  totalCost: number,
  totalTokens: number,
  calls: LLMUsageRecord[]
): Promise<string> {
  const embeddingStr = `[${embedding.join(',')}]`;

  return await db.transaction(async (tx) => {
    // Insert candidate — use raw sql for the vector cast
    const result = await tx.execute(sql`
      INSERT INTO candidates (full_name, email, phone, location, summary, raw_text, original_filename, embedding, original_document, document_mime_type, ingestion_cost, ingestion_tokens)
      VALUES (${cv.full_name}, ${cv.email}, ${cv.phone}, ${cv.location}, ${cv.summary}, ${rawText}, ${originalFilename}, ${embeddingStr}::vector, ${documentBuffer}, ${documentMimeType}, ${totalCost}, ${totalTokens})
      RETURNING id
    `);
    const candidateId = (result.rows[0] as { id: string }).id;

    // Log LLM calls
    for (const call of calls) {
      await tx.insert(llmCalls).values({
        candidateId,
        operation: call.operation,
        model: call.model,
        promptTokens: call.usage.promptTokens,
        completionTokens: call.usage.completionTokens,
        totalTokens: call.usage.totalTokens,
        cost: call.cost.toFixed(6),
      });
    }

    // Insert experiences
    for (const exp of cv.experiences) {
      await tx.insert(experiences).values({
        candidateId,
        company: exp.company,
        title: exp.title,
        startDate: sanitizeDate(exp.start_date),
        endDate: sanitizeDate(exp.end_date),
        isCurrent: exp.is_current,
        description: exp.description,
        location: exp.location,
      });
    }

    // Insert education
    for (const edu of cv.education) {
      await tx.insert(education).values({
        candidateId,
        institution: edu.institution,
        degree: edu.degree,
        fieldOfStudy: edu.field_of_study,
        startDate: sanitizeDate(edu.start_date),
        endDate: sanitizeDate(edu.end_date),
        description: edu.description,
      });
    }

    // Insert skills
    for (const skill of cv.skills) {
      await tx.insert(skills).values({
        candidateId,
        name: skill.name,
        category: skill.category,
        proficiency: skill.proficiency,
      });
    }

    // Insert languages
    for (const lang of cv.languages) {
      await tx.insert(languages).values({
        candidateId,
        name: lang.name,
        proficiency: lang.proficiency,
      });
    }

    // Insert certifications
    for (const cert of cv.certifications) {
      await tx.insert(certifications).values({
        candidateId,
        name: cert.name,
        issuer: cert.issuer,
        issueDate: sanitizeDate(cert.issue_date),
      });
    }

    return candidateId;
  });
}
