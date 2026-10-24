/**
 * In-process Postgres (PGlite/WASM) loaded with a Supabase shim and all
 * migrations. Lets us test SQL, RLS and seed data — and generate types —
 * on any OS without Docker or a Supabase project.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { vector } from '@electric-sql/pglite-pgvector';
import { DB_PACKAGE_ROOT, MIGRATIONS_DIR } from './paths';

export { DB_PACKAGE_ROOT, MIGRATIONS_DIR };

const here = dirname(fileURLToPath(import.meta.url));

export function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => join(MIGRATIONS_DIR, file));
}

export async function createMigratedDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto, pg_trgm, vector } });
  await db.exec(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'));
  await db.exec('set search_path = public, extensions;');
  for (const file of listMigrations()) {
    try {
      await db.exec(readFileSync(file, 'utf8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration failed: ${file}\n${message}`);
    }
  }
  return db;
}

export type Db = PGlite | Transaction;

export interface TestUser {
  id: string;
  email: string;
}

/** Inserts an auth.users row (the trigger creates the matching profile). */
export async function createAuthUser(db: Db, email: string, fullName?: string): Promise<TestUser> {
  const result = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify(fullName ? { full_name: fullName } : {})],
  );
  const row = result.rows[0];
  if (!row) throw new Error('failed to create auth user');
  return { id: row.id, email };
}

/**
 * Runs `fn` inside a transaction as the `authenticated` role with the given
 * JWT claims — exactly how PostgREST executes requests for a signed-in user.
 */
export async function asUser<T>(
  db: PGlite,
  user: TestUser,
  fn: (tx: Transaction) => Promise<T>,
  extraClaims: Record<string, unknown> = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated', ...extraClaims }),
    ]);
    await tx.exec('set local role authenticated');
    return fn(tx);
  });
}

/** Runs `fn` as the service role (bypasses RLS), like the server admin client. */
export async function asServiceRole<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: 'service_role' }),
    ]);
    await tx.exec('set local role service_role');
    return fn(tx);
  });
}
