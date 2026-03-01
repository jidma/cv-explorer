import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { getEmbeddingProvider } from '../llm';

export async function semanticSearch(query: string, limit: number = 10) {
  const provider = getEmbeddingProvider();
  const { embedding } = await provider.embed(query);
  const embeddingStr = `[${embedding.join(',')}]`;

  const rows = await db.execute(sql`
    SELECT id, full_name, email, location, summary,
           1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM candidates
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `);

  return rows.rows;
}
