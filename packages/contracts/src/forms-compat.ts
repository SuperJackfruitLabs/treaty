/**
 * Within a version, a contract may only add optional things: the rule `compat.ts` holds for
 * schemas, applied to the forms that are not one schema but hold several (an MCP catalog).
 *
 * Each compare walks the form's own structure and hands every embedded schema to
 * `compareSchemas`, so a tool added is no finding and a tool's input narrowed is one.
 */
import { compareSchemas, type Breaking } from "./compat.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escape(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Which form a document under schemas/ follows, by its `$schema`; undefined for a plain schema. */
export function formOf(doc: unknown): "mcp-catalog" | undefined {
  if (!isObject(doc) || typeof doc.$schema !== "string") return undefined;
  if (doc.$schema.endsWith("/schemas/treaty/mcp-catalog.v1.json"))
    return "mcp-catalog";
  return undefined;
}

function nested(
  base: unknown,
  head: unknown,
  at: string,
  out: Breaking[],
): void {
  for (const b of compareSchemas(base ?? true, head ?? true))
    out.push({ pointer: `${at}${b.pointer}`, rule: b.rule });
}

function toolsByName(
  doc: Record<string, unknown>,
): Map<string, Record<string, unknown>> {
  const tools = Array.isArray(doc.tools) ? doc.tools : [];
  const byName = new Map<string, Record<string, unknown>>();
  for (const t of tools)
    if (isObject(t) && typeof t.name === "string") byName.set(t.name, t);
  return byName;
}

function payloadSchema(node: unknown): unknown {
  return isObject(node) ? node.schema : undefined;
}

function carrier(node: unknown): unknown {
  return isObject(node) ? node.carrier : undefined;
}

/** Breaking changes between two versions of one MCP catalog. Pointers name tools by name. */
export function compareMcpCatalogs(base: unknown, head: unknown): Breaking[] {
  const out: Breaking[] = [];
  if (!isObject(base) || !isObject(head)) return out;
  const before = toolsByName(base);
  const after = toolsByName(head);
  for (const [name, b] of before) {
    const at = `/tools/${escape(name)}`;
    const h = after.get(name);
    if (!h) {
      out.push({ pointer: at, rule: "tool-removed" });
      continue;
    }
    if (b.scope !== h.scope)
      out.push({ pointer: `${at}/scope`, rule: "scope-changed" });
    nested(b.inputSchema, h.inputSchema, `${at}/inputSchema`, out);
    if (carrier(b.result) !== carrier(h.result))
      out.push({ pointer: `${at}/result/carrier`, rule: "carrier-changed" });
    nested(
      payloadSchema(b.result),
      payloadSchema(h.result),
      `${at}/result/schema`,
      out,
    );
  }
  if (carrier(base.error) !== carrier(head.error))
    out.push({ pointer: "/error/carrier", rule: "carrier-changed" });
  nested(
    payloadSchema(base.error),
    payloadSchema(head.error),
    "/error/schema",
    out,
  );
  const baseDefs = isObject(base.$defs) ? base.$defs : {};
  const headDefs = isObject(head.$defs) ? head.$defs : {};
  for (const [name, schema] of Object.entries(baseDefs)) {
    const at = `/$defs/${escape(name)}`;
    if (!(name in headDefs)) out.push({ pointer: at, rule: "schema-removed" });
    else nested(schema, headDefs[name], at, out);
  }
  return out;
}

/** Breaking changes between two versions of a form's document, or undefined for a plain schema. */
export function compareForms(
  base: unknown,
  head: unknown,
): Breaking[] | undefined {
  const form = formOf(base);
  if (form === undefined) return undefined;
  if (formOf(head) !== form) return [{ pointer: "", rule: "form-changed" }];
  return compareMcpCatalogs(base, head);
}
