import { createHash } from "node:crypto";
import type { Client } from "pg";

export async function publicTables(client: Client) {
  const result = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE \"C\"",
  );
  for (const { tablename } of result.rows)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tablename))
      throw Error("Unexpected table identifier; manual review required");
  return result.rows.map((x) => x.tablename);
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function databaseSnapshot(client: Client) {
  await client.query("SET TIME ZONE 'UTC'");
  const tables = [];
  for (const name of await publicTables(client)) {
    const rows = await client.query<{ data: string }>(
      `SELECT to_jsonb(t)::text AS data FROM public."${name}" t ORDER BY to_jsonb(t)::text COLLATE "C"`,
    );
    tables.push({
      name,
      count: rows.rows.length,
      sha256: hash(rows.rows.map((x) => x.data)),
    });
  }
  return {
    tables,
    schemaSha256: hash(await schemaShape(client)),
    dataSha256: hash(tables),
  };
}
export async function schemaShape(client: Client) {
  const columns = (
    await client.query(
      "SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,character_maximum_length,numeric_precision,numeric_scale,datetime_precision FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name COLLATE \"C\",ordinal_position",
    )
  ).rows;
  const constraints = (
    await client.query<{
      table_name: string;
      conname: string;
      contype: string;
      definition: string;
    }>(
      'SELECT c.relname AS table_name,con.conname,con.contype,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=\'public\' ORDER BY c.relname COLLATE "C",con.conname COLLATE "C"',
    )
  ).rows;
  const indexes = (
    await client.query<{
      tablename: string;
      indexname: string;
      indexdef: string;
      predicate: string | null;
    }>(
      'SELECT t.relname AS tablename,i.relname AS indexname,pg_get_indexdef(i.oid) AS indexdef,pg_get_expr(x.indpred,x.indrelid) AS predicate FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=\'public\' ORDER BY t.relname COLLATE "C",i.relname COLLATE "C"',
    )
  ).rows;
  return { columns, constraints, indexes };
}
