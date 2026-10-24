/**
 * Offline equivalent of `supabase gen types typescript`: introspects a
 * migrated database (PGlite) and emits the same `Database` shape that
 * supabase-js / postgrest-js expect (Tables/Views/Functions/Enums with
 * Row/Insert/Update/Relationships).
 */
import type { PGlite } from '@electric-sql/pglite';

interface ColumnRow {
  table_name: string;
  name: string;
  type_name: string;
  type_schema: string;
  typtype: string;
  typcategory: string;
  elem_type_name: string | null;
  elem_type_schema: string | null;
  elem_typtype: string | null;
  is_nullable: boolean;
  has_default: boolean;
  identity: string;
  is_generated: boolean;
}

interface RelationRow {
  name: string;
  relkind: string;
}

interface ForeignKeyRow {
  name: string;
  source_table: string;
  target_table: string;
  target_schema: string;
  source_columns: string[];
  target_columns: string[];
  is_one_to_one: boolean;
}

interface FunctionRow {
  name: string;
  arg_names: string[] | null;
  arg_modes: string[] | null;
  arg_type_ids: number[];
  input_arg_count: number;
  default_count: number;
  returns_set: boolean;
  return_type_id: number;
  return_type_name: string;
  return_typtype: string;
  return_typrelid: number;
  return_table: string | null;
}

interface TypeRow {
  oid: number;
  name: string;
  schema: string;
  typtype: string;
  typcategory: string;
  elem_name: string | null;
  elem_schema: string | null;
  elem_typtype: string | null;
}

const NUMBER_TYPES = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'oid', 'money']);
const STRING_TYPES = new Set([
  'text', 'varchar', 'bpchar', 'char', 'name', 'uuid', 'citext', 'date', 'time', 'timetz',
  'timestamp', 'timestamptz', 'interval', 'inet', 'cidr', 'macaddr', 'bytea', 'vector', 'regclass',
]);

function scalarToTs(name: string, schema: string, typtype: string, targetSchema: string): string {
  if (typtype === 'e') {
    return schema === targetSchema ? `Database["${schema}"]["Enums"]["${name}"]` : 'string';
  }
  if (name === 'bool') return 'boolean';
  if (NUMBER_TYPES.has(name)) return 'number';
  if (STRING_TYPES.has(name)) return 'string';
  if (name === 'json' || name === 'jsonb') return 'Json';
  if (name === 'void') return 'undefined';
  if (name === 'record') return 'Record<string, unknown>';
  return 'unknown';
}

function columnToTs(col: ColumnRow, schema: string): string {
  if (col.typcategory === 'A' && col.elem_type_name) {
    return `${scalarToTs(col.elem_type_name, col.elem_type_schema ?? '', col.elem_typtype ?? '', schema)}[]`;
  }
  return scalarToTs(col.type_name, col.type_schema, col.typtype, schema);
}

function typeRowToTs(t: TypeRow | undefined, schema: string): string {
  if (!t) return 'unknown';
  if (t.typcategory === 'A' && t.elem_name) {
    return `${scalarToTs(t.elem_name, t.elem_schema ?? '', t.elem_typtype ?? '', schema)}[]`;
  }
  return scalarToTs(t.name, t.schema, t.typtype, schema);
}

const key = (name: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name));
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export async function generateTypes(db: PGlite, schema = 'public'): Promise<string> {
  const relations = (
    await db.query<RelationRow>(
      `select c.relname as name, c.relkind::text as relkind
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and c.relkind in ('r', 'p', 'v', 'm')
       order by c.relname`,
      [schema],
    )
  ).rows;

  const columns = (
    await db.query<ColumnRow>(
      `select c.relname as table_name, a.attname as name,
              t.typname as type_name, tn.nspname as type_schema, t.typtype::text as typtype,
              t.typcategory::text as typcategory,
              et.typname as elem_type_name, etn.nspname as elem_type_schema, et.typtype::text as elem_typtype,
              not a.attnotnull as is_nullable, a.atthasdef as has_default,
              a.attidentity::text as identity, a.attgenerated <> '' as is_generated
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_type t on t.oid = a.atttypid
       join pg_namespace tn on tn.oid = t.typnamespace
       left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
       left join pg_namespace etn on etn.oid = et.typnamespace
       where n.nspname = $1 and c.relkind in ('r', 'p', 'v', 'm') and a.attnum > 0 and not a.attisdropped
       order by c.relname, a.attname`,
      [schema],
    )
  ).rows;

  const enums = (
    await db.query<{ name: string; value: string }>(
      `select t.typname as name, e.enumlabel as value
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
       join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = $1
       order by t.typname, e.enumsortorder`,
      [schema],
    )
  ).rows;

  const foreignKeys = (
    await db.query<ForeignKeyRow>(
      `select con.conname as name, src.relname as source_table,
              tgt.relname as target_table, tn.nspname as target_schema,
              array(select a.attname::text from unnest(con.conkey) with ordinality k(attnum, ord)
                    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as source_columns,
              array(select a.attname::text from unnest(con.confkey) with ordinality k(attnum, ord)
                    join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum order by k.ord) as target_columns,
              exists (
                select 1 from pg_index i
                where i.indrelid = con.conrelid and i.indisunique and i.indpred is null
                  and (select array_agg(x order by x) from unnest(i.indkey::int2[]) x)
                    = (select array_agg(x order by x) from unnest(con.conkey) x)
              ) as is_one_to_one
       from pg_constraint con
       join pg_class src on src.oid = con.conrelid
       join pg_namespace sn on sn.oid = src.relnamespace
       join pg_class tgt on tgt.oid = con.confrelid
       join pg_namespace tn on tn.oid = tgt.relnamespace
       where con.contype = 'f' and sn.nspname = $1
       order by src.relname, con.conname`,
      [schema],
    )
  ).rows;

  const functions = (
    await db.query<FunctionRow>(
      `select p.proname as name,
              p.proargnames as arg_names,
              p.proargmodes::text[] as arg_modes,
              coalesce(p.proallargtypes::oid[], p.proargtypes::oid[])::int8[] as arg_type_ids,
              p.pronargs as input_arg_count,
              p.pronargdefaults as default_count,
              p.proretset as returns_set,
              p.prorettype::int8 as return_type_id,
              rt.typname as return_type_name,
              rt.typtype::text as return_typtype,
              rt.typrelid::int8 as return_typrelid,
              rc.relname as return_table
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       join pg_type rt on rt.oid = p.prorettype
       left join pg_class rc on rc.oid = rt.typrelid and rc.relkind in ('r', 'p', 'v', 'm')
       where n.nspname = $1 and p.prokind = 'f'
         and rt.typname not in ('trigger', 'event_trigger')
       order by p.proname`,
      [schema],
    )
  ).rows;

  const typeIds = new Set<number>();
  for (const fn of functions) {
    fn.arg_type_ids.forEach((id) => typeIds.add(Number(id)));
    typeIds.add(Number(fn.return_type_id));
  }
  const types = new Map<number, TypeRow>();
  if (typeIds.size > 0) {
    const rows = (
      await db.query<TypeRow>(
        `select t.oid::int8 as oid, t.typname as name, tn.nspname as schema, t.typtype::text as typtype,
                t.typcategory::text as typcategory, et.typname as elem_name, etn.nspname as elem_schema,
                et.typtype::text as elem_typtype
         from pg_type t
         join pg_namespace tn on tn.oid = t.typnamespace
         left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
         left join pg_namespace etn on etn.oid = et.typnamespace
         where t.oid = any($1::oid[])`,
        [[...typeIds]],
      )
    ).rows;
    rows.forEach((row) => types.set(Number(row.oid), row));
  }

  const columnsByTable = new Map<string, ColumnRow[]>();
  for (const col of columns) {
    const list = columnsByTable.get(col.table_name) ?? [];
    list.push(col);
    columnsByTable.set(col.table_name, list);
  }

  const rowShape = (tableName: string, indent: string) =>
    (columnsByTable.get(tableName) ?? [])
      .map((col) => `${indent}${key(col.name)}: ${columnToTs(col, schema)}${col.is_nullable ? ' | null' : ''}`)
      .join('\n');

  const insertShape = (tableName: string, indent: string) =>
    (columnsByTable.get(tableName) ?? [])
      .map((col) => {
        if (col.is_generated || col.identity === 'a') return `${indent}${key(col.name)}?: never`;
        const optional = col.is_nullable || col.has_default || col.identity === 'd';
        return `${indent}${key(col.name)}${optional ? '?' : ''}: ${columnToTs(col, schema)}${col.is_nullable ? ' | null' : ''}`;
      })
      .join('\n');

  const updateShape = (tableName: string, indent: string) =>
    (columnsByTable.get(tableName) ?? [])
      .map((col) => {
        if (col.is_generated || col.identity === 'a') return `${indent}${key(col.name)}?: never`;
        return `${indent}${key(col.name)}?: ${columnToTs(col, schema)}${col.is_nullable ? ' | null' : ''}`;
      })
      .join('\n');

  const relationshipsFor = (tableName: string, indent: string) => {
    const rels = foreignKeys
      .filter((fk) => fk.source_table === tableName && fk.target_schema === schema)
      .sort(byName);
    if (rels.length === 0) return '[]';
    const body = rels
      .map(
        (fk) =>
          `${indent}  {\n` +
          `${indent}    foreignKeyName: "${fk.name}"\n` +
          `${indent}    columns: [${fk.source_columns.map((c) => `"${c}"`).join(', ')}]\n` +
          `${indent}    isOneToOne: ${fk.is_one_to_one}\n` +
          `${indent}    referencedRelation: "${fk.target_table}"\n` +
          `${indent}    referencedColumns: [${fk.target_columns.map((c) => `"${c}"`).join(', ')}]\n` +
          `${indent}  },`,
      )
      .join('\n');
    return `[\n${body}\n${indent}]`;
  };

  const tables = relations.filter((r) => r.relkind === 'r' || r.relkind === 'p').sort(byName);
  const views = relations.filter((r) => r.relkind === 'v' || r.relkind === 'm').sort(byName);

  const tablesTs = tables.length
    ? `{\n${tables
        .map(
          (t) =>
            `      ${key(t.name)}: {\n` +
            `        Row: {\n${rowShape(t.name, '          ')}\n        }\n` +
            `        Insert: {\n${insertShape(t.name, '          ')}\n        }\n` +
            `        Update: {\n${updateShape(t.name, '          ')}\n        }\n` +
            `        Relationships: ${relationshipsFor(t.name, '        ')}\n` +
            `      }`,
        )
        .join('\n')}\n    }`
    : '{\n      [_ in never]: never\n    }';

  const viewsTs = views.length
    ? `{\n${views
        .map(
          (v) =>
            `      ${key(v.name)}: {\n` +
            `        Row: {\n${rowShape(v.name, '          ')}\n        }\n` +
            `        Relationships: ${relationshipsFor(v.name, '        ')}\n` +
            `      }`,
        )
        .join('\n')}\n    }`
    : '{\n      [_ in never]: never\n    }';

  const functionTs = (fn: FunctionRow): string => {
    const modes = fn.arg_modes ?? fn.arg_type_ids.map(() => 'i');
    const names = fn.arg_names ?? [];
    const inputs: { name: string; ts: string; optional: boolean }[] = [];
    const tableColumns: { name: string; ts: string }[] = [];
    let inputIndex = 0;
    modes.forEach((mode, i) => {
      const typeId = Number(fn.arg_type_ids[i]);
      const ts = typeRowToTs(types.get(typeId), schema);
      const name = names[i] ?? `arg${i}`;
      if (mode === 'i' || mode === 'b' || mode === 'v') {
        const optional = inputIndex >= fn.input_arg_count - fn.default_count;
        inputs.push({ name, ts, optional });
        inputIndex += 1;
      } else if (mode === 't' || mode === 'o') {
        tableColumns.push({ name, ts });
      }
    });

    const args = inputs.length
      ? `{\n${inputs.map((a) => `          ${key(a.name)}${a.optional ? '?' : ''}: ${a.ts}`).join('\n')}\n        }`
      : 'never';

    let returns: string;
    if (tableColumns.length > 0) {
      returns = `{\n${tableColumns.map((c) => `          ${key(c.name)}: ${c.ts}`).join('\n')}\n        }${fn.returns_set ? '[]' : ''}`;
    } else if (fn.return_table) {
      const shape = rowShape(fn.return_table, '          ');
      returns = `{\n${shape}\n        }${fn.returns_set ? '[]' : ''}`;
    } else {
      const ts = typeRowToTs(types.get(Number(fn.return_type_id)), schema);
      returns = `${ts}${fn.returns_set ? '[]' : ''}`;
    }

    const setof = fn.return_table
      ? `\n        SetofOptions: {\n          from: "*"\n          to: "${fn.return_table}"\n          isOneToOne: ${!fn.returns_set}\n          isSetofReturn: ${fn.returns_set}\n        }`
      : '';

    return `      ${key(fn.name)}: {\n        Args: ${args}\n        Returns: ${returns}${setof}\n      }`;
  };

  const functionsTs = functions.length
    ? `{\n${[...functions].sort(byName).map(functionTs).join('\n')}\n    }`
    : '{\n      [_ in never]: never\n    }';

  const enumMap = new Map<string, string[]>();
  for (const e of enums) {
    const list = enumMap.get(e.name) ?? [];
    list.push(e.value);
    enumMap.set(e.name, list);
  }
  const enumNames = [...enumMap.keys()].sort();
  const enumsTs = enumNames.length
    ? `{\n${enumNames
        .map((name) => `      ${key(name)}:\n${(enumMap.get(name) ?? []).map((v) => `        | "${v}"`).join('\n')}`)
        .join('\n')}\n    }`
    : '{\n      [_ in never]: never\n    }';

  const constantsTs = enumNames
    .map(
      (name) =>
        `      ${key(name)}: [\n${(enumMap.get(name) ?? []).map((v) => `        "${v}",`).join('\n')}\n      ],`,
    )
    .join('\n');

  return `${HEADER}
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13"
  }
  ${schema}: {
    Tables: ${tablesTs}
    Views: ${viewsTs}
    Functions: ${functionsTs}
    Enums: ${enumsTs}
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
${HELPERS}
export const Constants = {
  ${schema}: {
    Enums: {
${constantsTs}
    },
  },
} as const
`;
}

const HEADER = `// =============================================================================
// GENERATED FILE — do not edit by hand.
// Regenerate offline from the migrations:   pnpm db:types:local
// Or from a live Supabase project:          pnpm db:types   (needs SUPABASE_PROJECT_ID)
// =============================================================================
`;

const HELPERS = `
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
`;
