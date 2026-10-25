import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null };

/**
 * Tiny in-memory stand-in for the Supabase query builder (insert / upsert /
 * update / delete / select with eq-style filters). `unique` lists column sets
 * per table that raise 23505 on duplicate inserts, like real unique indexes.
 */
export function createMemoryDb(unique: Record<string, string[][]> = {}) {
  const tables = new Map<string, Row[]>();
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };

  function from(name: string) {
    let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] | null = null;
    let conflict: string[] = ['id'];
    const filters: ((row: Row) => boolean)[] = [];
    let window: [number, number] | null = null;

    const run = async (): Promise<Result> => {
      const rows = table(name);
      const matches = () => rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'select') {
        const found = matches().map((r) => ({ ...r }));
        return { data: window ? found.slice(window[0], window[1] + 1) : found, error: null };
      }
      if (op === 'update') {
        const hit = matches();
        hit.forEach((r) => Object.assign(r, payload));
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (op === 'delete') {
        const hit = matches();
        tables.set(name, rows.filter((r) => !hit.includes(r)));
        return { data: hit, error: null };
      }
      const incoming = (Array.isArray(payload) ? payload : [payload]) as Row[];
      const written: Row[] = [];
      for (const row of incoming) {
        if (op === 'upsert') {
          const existing = rows.find((r) => conflict.every((c) => r[c] === row[c]));
          if (existing) {
            Object.assign(existing, row);
            written.push({ ...existing });
            continue;
          }
        }
        const duplicate = (unique[name] ?? []).some((cols) => rows.some((r) => cols.every((c) => row[c] != null && r[c] === row[c])));
        if (duplicate) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        const stored = { id: randomUUID(), ...row };
        rows.push(stored);
        written.push({ ...stored });
      }
      return { data: written, error: null };
    };

    const builder = {
      select: () => builder,
      insert: (p: Row | Row[]) => ((op = 'insert'), (payload = p), builder),
      upsert: (p: Row | Row[], o?: { onConflict?: string }) => ((op = 'upsert'), (payload = p), (conflict = (o?.onConflict ?? 'id').split(',')), builder),
      update: (p: Row) => ((op = 'update'), (payload = p), builder),
      delete: () => ((op = 'delete'), builder),
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), builder),
      neq: (col: string, val: unknown) => (filters.push((r) => r[col] !== val), builder),
      is: (col: string, val: unknown) => (filters.push((r) => (r[col] ?? null) === val), builder),
      in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), builder),
      not: (col: string, op: 'is' | 'eq', val: unknown) => (filters.push((r) => (op === 'is' ? (r[col] ?? null) !== val : r[col] !== val)), builder),
      order: () => builder,
      limit: () => builder,
      range: (from: number, to: number) => ((window = [from, to]), builder),
      single: async () => {
        const { data, error } = await run();
        if (error) return { data: null, error };
        const list = data as Row[];
        return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'Expected one row' } };
      },
      maybeSingle: async () => {
        const { data, error } = await run();
        return error ? { data: null, error } : { data: (data as Row[])[0] ?? null, error: null };
      },
      then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => run().then(resolve, reject),
    };
    return builder;
  }

  return { from: vi.fn(from), rpc: vi.fn(async (_name: string, _args?: unknown) => ({ data: null as unknown, error: null as { message: string } | null })), tables, table };
}
