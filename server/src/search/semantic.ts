import { pool } from '../db/connection';
import { getEmbeddingProvider } from '../llm';

export async function semanticSearch(query: string, limit: number = 10) {
  const provider = getEmbeddingProvider();
  const queryEmbedding = await provider.embed(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const { rows } = await pool.query(
    `SELECT id, full_name, email, location, summary,
            1 - (embedding <=> $1::vector) AS similarity
     FROM candidates
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embeddingStr, limit]
  );

  return rows;
}
