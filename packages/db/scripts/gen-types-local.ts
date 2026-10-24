/**
 * Generates packages/db/types.ts from the SQL migrations without Docker or a
 * Supabase project: migrations run in PGlite, then the catalog is introspected.
 *
 *   pnpm db:types:local
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMigratedDb, DB_PACKAGE_ROOT } from './lib/pglite';
import { generateTypes } from './lib/typegen';

async function main() {
  const db = await createMigratedDb();
  const source = await generateTypes(db, 'public');
  const target = join(DB_PACKAGE_ROOT, 'types.ts');
  writeFileSync(target, source, 'utf8');
  await db.close();
  console.log(`✓ Wrote ${target}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
