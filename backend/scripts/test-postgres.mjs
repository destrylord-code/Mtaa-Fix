#!/usr/bin/env node
/**
 * Reproducible PostgreSQL integration run without an external database service.
 * Uses PGlite (Postgres in WASM) as a development-only test database, applies the
 * repository's migration SQL, then runs the API suites against it over the
 * PostgreSQL wire protocol. Production deployments must use `prisma migrate deploy`
 * against a real PostgreSQL/Supabase database; this harness is not a production DB.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(backendDir, 'prisma', 'migrations');
const port = Number(process.env.TEST_PG_PORT || 55433);
const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id VARCHAR(36) PRIMARY KEY, checksum VARCHAR(64) NOT NULL, finished_at TIMESTAMPTZ,
    migration_name VARCHAR(255) NOT NULL, logs TEXT, rolled_back_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(), applied_steps_count INTEGER NOT NULL DEFAULT 0
  )`);
  const names = fs.readdirSync(migrationsDir).filter((n) => /^\d/.test(n)).sort();
  for (const name of names) {
    const script = fs.readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8');
    const started = new Date();
    await client.query(script);
    await client.query(
      'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES ($1,$2,$3,$4,$5,$6)',
      [crypto.randomUUID(), crypto.createHash('sha256').update(script).digest('hex'), new Date(), name, started, 1],
    );
    console.log(`[test-postgres] applied ${name}`);
  }
} finally {
  await client.end();
}

const child = spawn('npm', ['test'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: { ...process.env, MTAA_TEST_DATABASE_URL: url, PGSSL_DISABLE: 'true', NODE_ENV: 'test' },
});
const code = await new Promise((resolve) => child.on('exit', resolve));
await server.stop();
await db.close();
process.exit(code ?? 1);
