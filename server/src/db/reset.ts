import { pool } from './connection';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  console.log('Dropping schemas...');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await runMigrations();
  console.log('DB reset complete.');
  await pool.end();
}

main().catch(async (err) => {
  console.error('DB reset failed:', err);
  await pool.end();
  process.exit(1);
});
