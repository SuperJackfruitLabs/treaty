/**
 * Within a version, a contract may only add optional things: the rule `compat.ts` holds for
 * schemas, applied to the forms that are not one plain schema: an MCP catalog, telemetry
 * conventions, a URL shape.
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
export type Form = "mcp-catalog" | "telemetry-conventions" | "url-shape";

const FORMS: Record<string, Form> = {
  "mcp-catalog.v1.json": "mcp-catalog",
  "telemetry-conventions.v1.json": "telemetry-conventions",
  "url-shape.v1.json": "url-shape",
};

export function formOf(doc: unknown): Form | undefined {
  if (!isObject(doc) || typeof doc.$schema !== "string") return undefined;
  const prefix = "/schemas/treaty/";
  const at = doc.$schema.lastIndexOf(prefix);
  return at === -1 ? undefined : FORMS[doc.$schema.slice(at + prefix.length)];
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

const objectAt = (node: unknown, key: string): Record<string, unknown> => {
  const value = isObject(node) ? node[key] : undefined;
  return isObject(value) ? value : {};
};

const list = (node: unknown, key: string): string[] => {
  const value = isObject(node) ? node[key] : undefined;
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
};

const stable = (value: unknown): string => JSON.stringify(value ?? null);

/** Breaking changes between two versions of one set of telemetry conventions. */
export function compareTelemetryConventions(
  base: unknown,
  head: unknown,
): Breaking[] {
  const out: Breaking[] = [];
  const headAttrs = objectAt(head, "attributes");
  for (const [key, b] of Object.entries(objectAt(base, "attributes"))) {
    const at = `/attributes/${escape(key)}`;
    const h = headAttrs[key];
    if (!isObject(h) || !isObject(b)) {
      out.push({ pointer: at, rule: "attribute-removed" });
      continue;
    }
    if (b.type !== h.type) out.push({ pointer: at, rule: "type-changed" });
    for (const constraint of ["enum", "minimum"])
      if (stable(b[constraint]) !== stable(h[constraint]))
        out.push({ pointer: at, rule: `constraint-changed:${constraint}` });
  }
  for (const kind of ["spans", "logs"]) {
    const headRecords = objectAt(head, kind);
    for (const [name, b] of Object.entries(objectAt(base, kind))) {
      const at = `/${kind}/${escape(name)}`;
      const h = headRecords[name];
      if (!isObject(h)) {
        out.push({ pointer: at, rule: "record-removed" });
        continue;
      }
      const before = list(b, "required");
      const after = list(h, "required");
      for (const key of after)
        if (!before.includes(key))
          out.push({
            pointer: `${at}/required/${escape(key)}`,
            rule: "required-added",
          });
      for (const key of before)
        if (!after.includes(key))
          out.push({
            pointer: `${at}/required/${escape(key)}`,
            rule: "required-removed",
          });
      const named = new Set([...after, ...list(h, "optional")]);
      for (const key of list(b, "optional"))
        if (!named.has(key))
          out.push({
            pointer: `${at}/optional/${escape(key)}`,
            rule: "optional-removed",
          });
    }
  }
  const headProps = objectAt(head, "propagation");
  for (const [name, b] of Object.entries(objectAt(base, "propagation"))) {
    const at = `/propagation/${escape(name)}`;
    const h = headProps[name];
    if (!isObject(h)) {
      out.push({ pointer: at, rule: "propagation-removed" });
      continue;
    }
    if (isObject(b) && b.carrier !== h.carrier)
      out.push({ pointer: `${at}/carrier`, rule: "carrier-changed" });
    const headFields = objectAt(h, "fields");
    for (const [field, bf] of Object.entries(objectAt(b, "fields"))) {
      const where = `${at}/fields/${escape(field)}`;
      const hf = headFields[field];
      if (!isObject(hf) || !isObject(bf)) {
        out.push({ pointer: where, rule: "field-removed" });
        continue;
      }
      if (bf.required !== true && hf.required === true)
        out.push({ pointer: where, rule: "field-became-required" });
      nested(bf.schema, hf.schema, `${where}/schema`, out);
    }
    for (const [field, hf] of Object.entries(headFields))
      if (
        !(field in objectAt(b, "fields")) &&
        isObject(hf) &&
        hf.required === true
      )
        out.push({
          pointer: `${at}/fields/${escape(field)}`,
          rule: "field-required-added",
        });
  }
  return out;
}

/**
 * Breaking changes between two versions of one URL shape. Any change to the origins or the path
 * breaks one side: a producer building the new URL for a consumer reading the old, or the other
 * way round.
 */
export function compareUrlShapes(base: unknown, head: unknown): Breaking[] {
  const out: Breaking[] = [];
  if (!isObject(base) || !isObject(head)) return out;
  if (stable(base.origins) !== stable(head.origins))
    out.push({ pointer: "/origins", rule: "origins-changed" });
  if (base.path !== head.path)
    out.push({ pointer: "/path", rule: "path-changed" });
  for (const where of ["query", "fragment"]) {
    const before = objectAt(base, where);
    const after = objectAt(head, where);
    for (const [name, b] of Object.entries(before)) {
      const at = `/${where}/${escape(name)}`;
      const h = after[name];
      if (!isObject(h) || !isObject(b)) {
        out.push({ pointer: at, rule: "parameter-removed" });
        continue;
      }
      if (b.required !== true && h.required === true)
        out.push({ pointer: at, rule: "parameter-became-required" });
      nested(b.schema, h.schema, `${at}/schema`, out);
    }
    for (const [name, h] of Object.entries(after))
      if (!(name in before) && isObject(h) && h.required === true)
        out.push({
          pointer: `/${where}/${escape(name)}`,
          rule: "parameter-required-added",
        });
  }
  return out;
}

const COMPARE: Record<Form, (base: unknown, head: unknown) => Breaking[]> = {
  "mcp-catalog": compareMcpCatalogs,
  "telemetry-conventions": compareTelemetryConventions,
  "url-shape": compareUrlShapes,
};

/** Breaking changes between two versions of a form's document, or undefined for a plain schema. */
export function compareForms(
  base: unknown,
  head: unknown,
): Breaking[] | undefined {
  const form = formOf(base);
  if (form === undefined) return undefined;
  if (formOf(head) !== form) return [{ pointer: "", rule: "form-changed" }];
  return COMPARE[form](base, head);
}
