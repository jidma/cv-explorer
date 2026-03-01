import { pool } from './connection';

async function reset() {
  const client = await pool.connect();
  try {
    console.log('Dropping public schema...');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    console.log('Recreating public schema...');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO postgres');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    console.log('Database reset complete. Run migrations to recreate tables.');
  } finally {
    client.release();
    await pool.end();
  }
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
