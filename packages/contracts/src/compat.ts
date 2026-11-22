/**
 * Within a version, a contract may only add optional things. Everything else would break a
 * reader still on the old shape or a writer still sending it, so it needs a new version beside
 * the old one.
 *
 * `compareSchemas` and `compareOpenApi` find the breaking changes between two versions of one
 * file by structure. The corpus rule (each side's valid cases validate under the other's schema)
 * runs in `scripts/compat.ts`, where both bundles exist.
 */

export interface Breaking {
  /** JSON pointer, in the head schema, of what changed. */
  pointer: string;
  rule: string;
}

type Node = Record<string, unknown>;

function isObject(value: unknown): value is Node {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Keywords that say nothing about which instances are valid. */
const ANNOTATIONS = new Set([
  "$schema",
  "$id",
  "$comment",
  "title",
  "description",
  "examples",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "contentMediaType",
  "contentEncoding",
]);

/** Keywords this file walks into, by name, rather than comparing as values. */
const STRUCTURAL = new Set([
  "type",
  "required",
  "properties",
  "additionalProperties",
  "enum",
  "const",
  "items",
  "prefixItems",
  "$defs",
  "definitions",
  "oneOf",
  "anyOf",
  "allOf",
  "$ref",
  "not",
]);

const COMPOSITIONS = ["oneOf", "anyOf", "allOf"] as const;

function escape(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .toSorted()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function typeSet(value: unknown): string {
  if (value === undefined) return "";
  const list = Array.isArray(value) ? value : [value];
  return list.map(String).toSorted().join(",");
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function compareNode(
  base: unknown,
  head: unknown,
  at: string,
  out: Breaking[],
): void {
  if (!isObject(base) || !isObject(head)) {
    if (stable(base) !== stable(head))
      out.push({ pointer: at, rule: "schema-changed" });
    return;
  }

  if (typeSet(base.type) !== typeSet(head.type))
    out.push({ pointer: at, rule: "type-changed" });

  const baseRequired = strings(base.required);
  const headRequired = strings(head.required);
  for (const name of headRequired)
    if (!baseRequired.includes(name))
      out.push({
        pointer: `${at}/required/${escape(name)}`,
        rule: "required-added",
      });
  for (const name of baseRequired)
    if (!headRequired.includes(name))
      out.push({
        pointer: `${at}/required/${escape(name)}`,
        rule: "required-removed",
      });

  const baseProps = isObject(base.properties) ? base.properties : {};
  const headProps = isObject(head.properties) ? head.properties : {};
  const baseClosed = base.additionalProperties === false;
  for (const [name, schema] of Object.entries(baseProps)) {
    const where = `${at}/properties/${escape(name)}`;
    if (!(name in headProps))
      out.push({ pointer: where, rule: "property-removed" });
    else compareNode(schema, headProps[name], where, out);
  }
  if (baseClosed)
    for (const name of Object.keys(headProps))
      if (!(name in baseProps))
        out.push({
          pointer: `${at}/properties/${escape(name)}`,
          rule: "property-added-to-closed",
        });

  if (!baseClosed && head.additionalProperties === false)
    out.push({ pointer: at, rule: "additional-properties-closed" });
  else if (
    isObject(base.additionalProperties) ||
    isObject(head.additionalProperties)
  )
    compareNode(
      base.additionalProperties ?? true,
      head.additionalProperties ?? true,
      `${at}/additionalProperties`,
      out,
    );

  if (base.enum !== undefined || head.enum !== undefined) {
    const before = new Set(
      (Array.isArray(base.enum) ? base.enum : []).map(stable),
    );
    const after = new Set(
      (Array.isArray(head.enum) ? head.enum : []).map(stable),
    );
    if ([...before].some((v) => !after.has(v)))
      out.push({ pointer: at, rule: "enum-narrowed" });
    if ([...after].some((v) => !before.has(v)))
      out.push({ pointer: at, rule: "enum-widened" });
  }

  if (stable(base.const) !== stable(head.const))
    out.push({ pointer: at, rule: "const-changed" });

  if (base.$ref !== head.$ref) out.push({ pointer: at, rule: "ref-changed" });

  if (base.items !== undefined || head.items !== undefined)
    compareNode(base.items ?? true, head.items ?? true, `${at}/items`, out);
  if (base.not !== undefined || head.not !== undefined)
    compareNode(base.not ?? true, head.not ?? true, `${at}/not`, out);

  const baseTuple = Array.isArray(base.prefixItems) ? base.prefixItems : [];
  const headTuple = Array.isArray(head.prefixItems) ? head.prefixItems : [];
  if (baseTuple.length !== headTuple.length)
    out.push({ pointer: at, rule: "composition-changed:prefixItems" });
  else
    for (const [i, item] of baseTuple.entries())
      compareNode(item, headTuple[i], `${at}/prefixItems/${i}`, out);

  for (const key of COMPOSITIONS) {
    const before = Array.isArray(base[key]) ? base[key] : [];
    const after = Array.isArray(head[key]) ? head[key] : [];
    if (before.length !== after.length)
      out.push({ pointer: at, rule: `composition-changed:${key}` });
    else
      for (const [i, branch] of before.entries())
        compareNode(branch, after[i], `${at}/${key}/${i}`, out);
  }

  for (const defs of ["$defs", "definitions"] as const) {
    const before = isObject(base[defs]) ? base[defs] : {};
    const after = isObject(head[defs]) ? head[defs] : {};
    for (const [name, schema] of Object.entries(before)) {
      const where = `${at}/${defs}/${escape(name)}`;
      if (!(name in after))
        out.push({ pointer: where, rule: "schema-removed" });
      else compareNode(schema, after[name], where, out);
    }
  }

  const keys = new Set([...Object.keys(base), ...Object.keys(head)]);
  for (const key of [...keys].toSorted()) {
    if (ANNOTATIONS.has(key) || STRUCTURAL.has(key) || key.startsWith("x-"))
      continue;
    if (stable(base[key]) !== stable(head[key]))
      out.push({ pointer: at, rule: `constraint-changed:${key}` });
  }
}

/** Every change from `base` to `head` that would break a reader or a writer. */
export function compareSchemas(base: unknown, head: unknown): Breaking[] {
  const out: Breaking[] = [];
  compareNode(base, head, "", out);
  return out;
}

const METHODS = ["get", "put", "post", "delete", "patch", "head", "options"];

interface Op {
  pointer: string;
  key: string;
  node: Node;
}

function opsById(doc: unknown): Map<string, Op> {
  const found = new Map<string, Op>();
  if (!isObject(doc) || !isObject(doc.paths)) return found;
  for (const [path, item] of Object.entries(doc.paths)) {
    if (!isObject(item)) continue;
    for (const method of METHODS) {
      const op = item[method];
      if (isObject(op) && typeof op.operationId === "string")
        found.set(op.operationId, {
          pointer: `/paths/${escape(path)}/${method}`,
          key: `${method} ${path}`,
          node: op,
        });
    }
  }
  return found;
}

function jsonSchema(holder: unknown): unknown {
  if (!isObject(holder) || !isObject(holder.content)) return undefined;
  const media = holder.content["application/json"];
  return isObject(media) ? media.schema : undefined;
}

function parameters(op: Node): Map<string, Node> {
  const found = new Map<string, Node>();
  for (const p of Array.isArray(op.parameters) ? op.parameters : [])
    if (isObject(p) && typeof p.name === "string" && typeof p.in === "string")
      found.set(`${p.in}:${p.name}`, p);
  return found;
}

function compareOperation(base: Op, head: Op, out: Breaking[]): void {
  const at = head.pointer;
  if (base.key !== head.key)
    out.push({ pointer: at, rule: "method-or-path-changed" });

  const before = parameters(base.node);
  const after = parameters(head.node);
  for (const [key, p] of before) {
    const q = after.get(key);
    if (!q)
      out.push({
        pointer: `${at}/parameters/${key}`,
        rule: "parameter-removed",
      });
    else
      compareNode(
        p.schema ?? true,
        q.schema ?? true,
        `${at}/parameters/${key}/schema`,
        out,
      );
  }
  for (const [key, q] of after)
    if (!before.has(key) && q.required === true)
      out.push({
        pointer: `${at}/parameters/${key}`,
        rule: "parameter-required-added",
      });

  const baseBody = jsonSchema(base.node.requestBody);
  const headBody = jsonSchema(head.node.requestBody);
  if (baseBody !== undefined && headBody === undefined)
    out.push({ pointer: `${at}/requestBody`, rule: "request-removed" });
  else if (baseBody === undefined && headBody !== undefined) {
    const required =
      isObject(head.node.requestBody) &&
      head.node.requestBody.required === true;
    if (required)
      out.push({
        pointer: `${at}/requestBody`,
        rule: "request-required-added",
      });
  } else if (baseBody !== undefined)
    compareNode(baseBody, headBody, `${at}/requestBody`, out);

  const baseResponses = isObject(base.node.responses)
    ? base.node.responses
    : {};
  const headResponses = isObject(head.node.responses)
    ? head.node.responses
    : {};
  for (const [status, response] of Object.entries(baseResponses)) {
    const where = `${at}/responses/${status}`;
    if (!(status in headResponses)) {
      out.push({ pointer: where, rule: "response-status-removed" });
      continue;
    }
    const b = jsonSchema(response);
    const h = jsonSchema(headResponses[status]);
    if (b === undefined && h === undefined) continue;
    compareNode(b ?? false, h ?? false, where, out);
  }
}

function components(doc: unknown): Node {
  if (!isObject(doc) || !isObject(doc.components)) return {};
  return isObject(doc.components.schemas) ? doc.components.schemas : {};
}

/** Every change from `base` to `head` that would break a client or a server of the API. */
export function compareOpenApi(base: unknown, head: unknown): Breaking[] {
  const out: Breaking[] = [];
  const before = opsById(base);
  const after = opsById(head);
  for (const [id, op] of before) {
    const next = after.get(id);
    if (!next) out.push({ pointer: op.pointer, rule: "operation-removed" });
    else compareOperation(op, next, out);
  }
  const baseSchemas = components(base);
  const headSchemas = components(head);
  for (const [name, schema] of Object.entries(baseSchemas)) {
    const where = `/components/schemas/${escape(name)}`;
    if (!(name in headSchemas))
      out.push({ pointer: where, rule: "schema-removed" });
    else compareNode(schema, headSchemas[name], where, out);
  }
  return out;
}
