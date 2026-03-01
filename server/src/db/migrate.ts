import path from 'path';
import { existsSync } from 'fs';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client';
import { pool } from './connection';

function resolveMigrationsDir(): string {
  const fromCwd = path.resolve(process.cwd(), 'src/db/migrations');
  const fromServer = path.resolve(process.cwd(), 'server/src/db/migrations');
  return [fromCwd, fromServer].find((dir) => existsSync(dir)) ?? fromCwd;
}

async function ensureExtensions(): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await pool.query('CREATE EXTENSION IF NOT EXISTS "vector"');
}

export async function runMigrations(): Promise<void> {
  await ensureExtensions();
  await migrate(db, { migrationsFolder: resolveMigrationsDir() });
}
