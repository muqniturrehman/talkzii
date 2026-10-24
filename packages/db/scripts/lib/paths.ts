import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const DB_PACKAGE_ROOT = join(here, '..', '..');
export const MIGRATIONS_DIR = join(DB_PACKAGE_ROOT, 'supabase', 'migrations');
