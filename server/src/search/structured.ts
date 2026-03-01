import { eq, ilike, desc, asc, count } from 'drizzle-orm';
import { db } from '../db/client';
import { pool } from '../db/connection';
import { candidates, experiences, education, skills, languages, certifications } from '../db/schema';

export async function searchBySkills(skillNames: string[], minYearsExperience?: number) {
  const skillPlaceholders = skillNames.map((_, i) => `$${i + 1}`).join(', ');
  const params: (string | number)[] = skillNames.map(s => s.toLowerCase());

  let query = `
    SELECT DISTINCT c.id, c.full_name, c.email, c.location, c.summary,
           array_agg(DISTINCT s.name) AS matched_skills
    FROM candidates c
    JOIN skills s ON s.candidate_id = c.id
    WHERE LOWER(s.name) IN (${skillPlaceholders})
  `;

  if (minYearsExperience) {
    query += `
      AND c.id IN (
        SELECT candidate_id FROM experiences
        WHERE start_date IS NOT NULL
        GROUP BY candidate_id
        HAVING SUM(
          EXTRACT(YEAR FROM AGE(COALESCE(end_date, CURRENT_DATE), start_date))
        ) >= $${params.length + 1}
      )
    `;
    params.push(minYearsExperience);
  }

  query += ' GROUP BY c.id, c.full_name, c.email, c.location, c.summary ORDER BY COUNT(DISTINCT s.name) DESC LIMIT 20';

  const { rows } = await pool.query(query, params);
  return rows;
}

export async function searchByExperience(jobTitle?: string, minYears?: number, company?: string) {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (jobTitle) {
    conditions.push(`LOWER(e.title) LIKE $${paramIdx}`);
    params.push(`%${jobTitle.toLowerCase()}%`);
    paramIdx++;
  }

  if (company) {
    conditions.push(`LOWER(e.company) LIKE $${paramIdx}`);
    params.push(`%${company.toLowerCase()}%`);
    paramIdx++;
  }

  let query = `
    SELECT DISTINCT c.id, c.full_name, c.email, c.location, c.summary,
           e.title, e.company,
           EXTRACT(YEAR FROM AGE(COALESCE(e.end_date, CURRENT_DATE), e.start_date)) AS years
    FROM candidates c
    JOIN experiences e ON e.candidate_id = c.id
  `;

  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  if (minYears) {
    const whereOrAnd = conditions.length ? 'AND' : 'WHERE';
    query += ` ${whereOrAnd} e.start_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(COALESCE(e.end_date, CURRENT_DATE), e.start_date)) >= $${paramIdx}`;
    params.push(minYears);
  }

  query += ' ORDER BY years DESC NULLS LAST LIMIT 20';

  const { rows } = await pool.query(query, params);
  return rows;
}

export async function searchByEducation(degree?: string, field?: string, institution?: string) {
  const conditions: string[] = [];
  const params: string[] = [];
  let paramIdx = 1;

  if (degree) {
    conditions.push(`LOWER(ed.degree) LIKE $${paramIdx}`);
    params.push(`%${degree.toLowerCase()}%`);
    paramIdx++;
  }

  if (field) {
    conditions.push(`LOWER(ed.field_of_study) LIKE $${paramIdx}`);
    params.push(`%${field.toLowerCase()}%`);
    paramIdx++;
  }

  if (institution) {
    conditions.push(`LOWER(ed.institution) LIKE $${paramIdx}`);
    params.push(`%${institution.toLowerCase()}%`);
    paramIdx++;
  }

  let query = `
    SELECT DISTINCT c.id, c.full_name, c.email, c.location, c.summary,
           ed.degree, ed.field_of_study, ed.institution
    FROM candidates c
    JOIN education ed ON ed.candidate_id = c.id
  `;

  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' LIMIT 20';

  const { rows } = await pool.query(query, params);
  return rows;
}

export async function searchByLocation(location: string) {
  const rows = await db
    .select({
      id: candidates.id,
      full_name: candidates.fullName,
      email: candidates.email,
      location: candidates.location,
      summary: candidates.summary,
    })
    .from(candidates)
    .where(ilike(candidates.location, `%${location}%`))
    .limit(20);

  return rows;
}

export async function getCandidateDetail(candidateId: string) {
  const [candidate] = await db
    .select({
      id: candidates.id,
      full_name: candidates.fullName,
      email: candidates.email,
      phone: candidates.phone,
      location: candidates.location,
      summary: candidates.summary,
      original_filename: candidates.originalFilename,
      document_mime_type: candidates.documentMimeType,
      ingestion_cost: candidates.ingestionCost,
      ingestion_tokens: candidates.ingestionTokens,
      created_at: candidates.createdAt,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId));

  if (!candidate) return null;

  const [expRows, eduRows, skillRows, langRows, certRows] = await Promise.all([
    db.select().from(experiences).where(eq(experiences.candidateId, candidateId)).orderBy(desc(experiences.startDate)),
    db.select().from(education).where(eq(education.candidateId, candidateId)).orderBy(desc(education.startDate)),
    db.select().from(skills).where(eq(skills.candidateId, candidateId)).orderBy(asc(skills.category), asc(skills.name)),
    db.select().from(languages).where(eq(languages.candidateId, candidateId)),
    db.select().from(certifications).where(eq(certifications.candidateId, candidateId)),
  ]);

  return {
    ...candidate,
    experiences: expRows,
    education: eduRows,
    skills: skillRows,
    languages: langRows,
    certifications: certRows,
  };
}

export async function listAllCandidates(page: number = 1, limit: number = 20) {
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: candidates.id,
      full_name: candidates.fullName,
      email: candidates.email,
      location: candidates.location,
      summary: candidates.summary,
      ingestion_cost: candidates.ingestionCost,
      ingestion_tokens: candidates.ingestionTokens,
      created_at: candidates.createdAt,
    })
    .from(candidates)
    .orderBy(desc(candidates.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(candidates);

  return { candidates: rows, total, page, limit };
}
