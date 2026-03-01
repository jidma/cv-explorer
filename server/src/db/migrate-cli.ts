import { pool } from './connection';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  console.log('Running migrations...');
  await runMigrations();
  console.log('Migrations complete.');
  await pool.end();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await pool.end();
  process.exit(1);
});
