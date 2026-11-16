import { createHash } from "node:crypto";
import type { Client } from "pg";
import type { schemaShape } from "./database-snapshot.js";

// pg_dump reparses CHECKs/partial predicates (e.g. array casts and flattened
// ANDs). Compare both through the same PostgreSQL parser, not by stripping SQL.
// Only temporary objects are created; public schema/data are never modified.
export async function canonicalSchema(
  shape: Awaited<ReturnType<typeof schemaShape>>,
  target: Client,
) {
  const constraints = [];
  const indexes = [];
  const tables = new Map<string, string>();
  let expressionNumber = 0;
  await target.query("BEGIN");
  try {
    async function parse(table: string, definition: string) {
      let temp = tables.get(table);
      if (!temp) {
        temp = `ssc_schema_compare_${tables.size}`;
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table))
          throw Error("Unexpected schema identifier");
        await target.query(
          `CREATE TEMP TABLE "${temp}" (LIKE public."${table}") ON COMMIT DROP`,
        );
        tables.set(table, temp);
      }
      const name = `ssc_compare_${expressionNumber++}`;
      await target.query(
        `ALTER TABLE pg_temp."${temp}" ADD CONSTRAINT "${name}" ${definition}`,
      );
      const result = await target.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2",
        [`pg_temp."${temp}"`, name],
      );
      return result.rows[0].definition;
    }
    for (const constraint of shape.constraints)
      constraints.push({
        ...constraint,
        definition:
          constraint.contype === "c"
            ? await parse(constraint.table_name, constraint.definition)
            : constraint.definition,
      });
    for (const index of shape.indexes)
      indexes.push(
        index.predicate
          ? {
              ...index,
              indexdef: index.indexdef.replace(/ WHERE [\s\S]*$/, ""),
              predicate: await parse(
                index.tablename,
                `CHECK (${index.predicate})`,
              ),
            }
          : index,
      );
    return createHash("sha256")
      .update(JSON.stringify({ columns: shape.columns, constraints, indexes }))
      .digest("hex");
  } finally {
    await target.query("ROLLBACK");
  }
}
