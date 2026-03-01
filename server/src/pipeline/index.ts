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

  // Step 1: Parse
  console.log('[Pipeline] Parsing...');
  const rawText = await parseResume(filePath);

  // Step 2: Extract
  console.log('[Pipeline] Extracting...');
  const extraction = await extractCV(rawText);
  calls.push(extraction.usage);

  // Step 3: Enrich
  console.log('[Pipeline] Enriching...');
  const enrichment = await enrichCV(extraction.data);
  calls.push(enrichment.usage);

  // Step 4: Embed
  console.log('[Pipeline] Generating embedding...');
  const embedResult = await generateEmbedding(enrichment.data, rawText);
  const embedUsage: LLMUsageRecord = {
    model: embedResult.model,
    usage: embedResult.usage,
    cost: calculateCost(embedResult.usage, embedResult.model),
    operation: 'embedding',
  };
  calls.push(embedUsage);

  // Totals
  const totalCost = calls.reduce((sum, c) => sum + c.cost, 0);
  const totalTokens = calls.reduce((sum, c) => sum + c.usage.totalTokens, 0);

  console.log(`[Pipeline] Cost: $${totalCost.toFixed(6)} | Tokens: ${totalTokens}`);

  // Step 5: Store
  console.log('[Pipeline] Storing...');
  const candidateId = await storeCandidate(
    enrichment.data, rawText, originalFilename,
    embedResult.embedding, fileBuffer, mimeType,
    totalCost, totalTokens, calls
  );

  console.log(`[Pipeline] Done. Candidate ID: ${candidateId}`);
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
        startDate: exp.start_date,
        endDate: exp.end_date,
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
        startDate: edu.start_date,
        endDate: edu.end_date,
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
        issueDate: cert.issue_date,
      });
    }

    return candidateId;
  });
}
