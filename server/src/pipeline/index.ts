import { pool } from '../db/connection';
import { parseResume } from './parser';
import { extractCV } from './extractor';
import { enrichCV } from './enricher';
import { generateEmbedding } from './embedder';
import type { ExtractedCV } from 'cv-explorer-shared';

export async function processResume(filePath: string, originalFilename: string): Promise<string> {
  console.log(`[Pipeline] Starting processing: ${originalFilename}`);

  // Step 1: Parse
  console.log('[Pipeline] Parsing...');
  const rawText = await parseResume(filePath);

  // Step 2: Extract
  console.log('[Pipeline] Extracting...');
  const extracted = await extractCV(rawText);

  // Step 3: Enrich
  console.log('[Pipeline] Enriching...');
  const enriched = await enrichCV(extracted);

  // Step 4: Embed
  console.log('[Pipeline] Generating embedding...');
  const embedding = await generateEmbedding(enriched, rawText);

  // Step 5: Store
  console.log('[Pipeline] Storing...');
  const candidateId = await storeCandidate(enriched, rawText, originalFilename, embedding);

  console.log(`[Pipeline] Done. Candidate ID: ${candidateId}`);
  return candidateId;
}

async function storeCandidate(
  cv: ExtractedCV,
  rawText: string,
  originalFilename: string,
  embedding: number[]
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert candidate
    const embeddingStr = `[${embedding.join(',')}]`;
    const { rows } = await client.query(
      `INSERT INTO candidates (full_name, email, phone, location, summary, raw_text, original_filename, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
       RETURNING id`,
      [cv.full_name, cv.email, cv.phone, cv.location, cv.summary, rawText, originalFilename, embeddingStr]
    );
    const candidateId = rows[0].id;

    // Insert experiences
    for (const exp of cv.experiences) {
      await client.query(
        `INSERT INTO experiences (candidate_id, company, title, start_date, end_date, is_current, description, location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [candidateId, exp.company, exp.title, exp.start_date, exp.end_date, exp.is_current, exp.description, exp.location]
      );
    }

    // Insert education
    for (const edu of cv.education) {
      await client.query(
        `INSERT INTO education (candidate_id, institution, degree, field_of_study, start_date, end_date, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [candidateId, edu.institution, edu.degree, edu.field_of_study, edu.start_date, edu.end_date, edu.description]
      );
    }

    // Insert skills
    for (const skill of cv.skills) {
      await client.query(
        `INSERT INTO skills (candidate_id, name, category, proficiency)
         VALUES ($1, $2, $3, $4)`,
        [candidateId, skill.name, skill.category, skill.proficiency]
      );
    }

    // Insert languages
    for (const lang of cv.languages) {
      await client.query(
        `INSERT INTO languages (candidate_id, name, proficiency)
         VALUES ($1, $2, $3)`,
        [candidateId, lang.name, lang.proficiency]
      );
    }

    // Insert certifications
    for (const cert of cv.certifications) {
      await client.query(
        `INSERT INTO certifications (candidate_id, name, issuer, issue_date)
         VALUES ($1, $2, $3, $4)`,
        [candidateId, cert.name, cert.issuer, cert.issue_date]
      );
    }

    await client.query('COMMIT');
    return candidateId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
