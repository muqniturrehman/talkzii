/**
 * Applies pending SQL migrations to the database in DATABASE_URL.
 * Docker-free and Windows-friendly alternative to `supabase db push`.
 *
 *   pnpm db:migrate
 *
 * Applied versions are recorded in supabase_migrations.schema_migrations (the
 * Supabase CLI's own table), so you can switch to the CLI later.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import pg from 'pg';
import { loadLocalEnv, requireEnv } from './lib/env';
import { MIGRATIONS_DIR } from './lib/paths';

async function main() {
  loadLocalEnv();
  const connectionString = requireEnv('DATABASE_URL');
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

  const client = new pg.Client({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text
      );
    `);

    const applied = new Set(
      (await client.query<{ version: string }>('select version from supabase_migrations.schema_migrations')).rows.map(
        (row) => row.version,
      ),
    );

    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    let count = 0;

    for (const file of files) {
      const [version, ...rest] = basename(file, '.sql').split('_');
      if (!version || applied.has(version)) continue;

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`→ ${file} ... `);
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(
          'insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)',
          [version, [sql], rest.join('_')],
        );
        await client.query('commit');
        count += 1;
        console.log('done');
      } catch (error) {
        await client.query('rollback');
        console.log('failed');
        throw error;
      }
    }

    console.log(count === 0 ? '✓ Database is up to date.' : `✓ Applied ${count} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
