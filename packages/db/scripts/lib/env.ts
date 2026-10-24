import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DB_PACKAGE_ROOT } from './paths';

/** Loads .env.local from the repo root and apps/web (first one wins per key). */
export function loadLocalEnv(): void {
  const repoRoot = join(DB_PACKAGE_ROOT, '..', '..');
  for (const file of [join(repoRoot, '.env.local'), join(repoRoot, 'apps', 'web', '.env.local'), join(repoRoot, '.env')]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ Missing environment variable ${name}. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}
