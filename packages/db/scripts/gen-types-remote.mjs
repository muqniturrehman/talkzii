// Generates packages/db/types.ts from a live Supabase project using the
// Supabase CLI (no Docker needed for --project-id). Cross-platform:
//   pnpm db:types        (requires SUPABASE_PROJECT_ID and `supabase login`)
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const envFile of [join(root, '..', '..', '.env.local'), join(root, '..', '..', 'apps', 'web', '.env.local')]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

const projectId = process.env.SUPABASE_PROJECT_ID;
if (!projectId) {
  console.error('SUPABASE_PROJECT_ID is not set. Use `pnpm db:types:local` to generate types offline.');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['--yes', 'supabase', 'gen', 'types', 'typescript', '--project-id', projectId, '--schema', 'public'],
  { encoding: 'utf8', shell: process.platform === 'win32' },
);

if (result.status !== 0) {
  console.error(result.stderr || result.error);
  process.exit(result.status ?? 1);
}

writeFileSync(join(root, 'types.ts'), result.stdout, 'utf8');
console.log('✓ Wrote packages/db/types.ts from project', projectId);
