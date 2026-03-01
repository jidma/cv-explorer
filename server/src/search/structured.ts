import { pool } from '../db/connection';

export async function searchBySkills(skills: string[], minYearsExperience?: number) {
  const skillPlaceholders = skills.map((_, i) => `$${i + 1}`).join(', ');

  let query = `
    SELECT DISTINCT c.id, c.full_name, c.email, c.location, c.summary,
           array_agg(DISTINCT s.name) AS matched_skills
    FROM candidates c
    JOIN skills s ON s.candidate_id = c.id
    WHERE LOWER(s.name) IN (${skillPlaceholders})
  `;
  const params: (string | number)[] = skills.map(s => s.toLowerCase());

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
  const { rows } = await pool.query(
    `SELECT id, full_name, email, location, summary
     FROM candidates
     WHERE LOWER(location) LIKE $1
     LIMIT 20`,
    [`%${location.toLowerCase()}%`]
  );
  return rows;
}

export async function getCandidateDetail(candidateId: string) {
  const { rows: [candidate] } = await pool.query(
    'SELECT id, full_name, email, phone, location, summary, original_filename, document_mime_type, created_at FROM candidates WHERE id = $1',
    [candidateId]
  );

  if (!candidate) return null;

  const [experiences, education, skills, languages, certifications] = await Promise.all([
    pool.query('SELECT * FROM experiences WHERE candidate_id = $1 ORDER BY start_date DESC', [candidateId]),
    pool.query('SELECT * FROM education WHERE candidate_id = $1 ORDER BY start_date DESC', [candidateId]),
    pool.query('SELECT * FROM skills WHERE candidate_id = $1 ORDER BY category, name', [candidateId]),
    pool.query('SELECT * FROM languages WHERE candidate_id = $1', [candidateId]),
    pool.query('SELECT * FROM certifications WHERE candidate_id = $1', [candidateId]),
  ]);

  return {
    ...candidate,
    experiences: experiences.rows,
    education: education.rows,
    skills: skills.rows,
    languages: languages.rows,
    certifications: certifications.rows,
  };
}

export async function listAllCandidates(page: number = 1, limit: number = 20) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT id, full_name, email, location, summary, created_at
     FROM candidates
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM candidates');

  return { candidates: rows, total: parseInt(count, 10), page, limit };
}
