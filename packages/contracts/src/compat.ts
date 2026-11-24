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

import { resolvePointer } from "./cases.ts";
import {
  bodySchemaPointer,
  documentOperations,
  isObject,
  type DocOperation,
  type Node,
} from "./openapi-doc.ts";

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
  "unevaluatedProperties",
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

/** Either keyword set to false refuses properties the schema does not name. */
function closed(n: Node): boolean {
  return n.additionalProperties === false || n.unevaluatedProperties === false;
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
  const baseClosed = closed(base);
  const headClosed = closed(head);
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

  if (!baseClosed && headClosed)
    out.push({ pointer: at, rule: "additional-properties-closed" });
  else if (baseClosed && !headClosed)
    // An old reader still refuses whatever a new writer adds.
    out.push({ pointer: at, rule: "additional-properties-opened" });
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

function compareParameters(
  base: DocOperation,
  head: DocOperation,
  at: string,
  out: Breaking[],
): void {
  for (const [key, p] of base.parameters) {
    const q = head.parameters.get(key);
    if (!q) {
      out.push({
        pointer: `${at}/parameters/${key}`,
        rule: "parameter-removed",
      });
      continue;
    }
    if (p.required !== true && q.required === true)
      out.push({
        pointer: `${at}/parameters/${key}`,
        rule: "parameter-became-required",
      });
    compareNode(
      p.schema ?? true,
      q.schema ?? true,
      `${at}/parameters/${key}/schema`,
      out,
    );
  }
  for (const [key, q] of head.parameters)
    if (!base.parameters.has(key) && q.required === true)
      out.push({
        pointer: `${at}/parameters/${key}`,
        rule: "parameter-required-added",
      });
}

function bodySchema(doc: unknown, holder: unknown, pointer: string): unknown {
  const at = bodySchemaPointer(doc, holder, pointer);
  return at === undefined ? undefined : resolvePointer(doc, at);
}

function compareOperation(
  baseDoc: unknown,
  headDoc: unknown,
  base: DocOperation,
  head: DocOperation,
  out: Breaking[],
): void {
  const at = head.pointer;
  if (base.method !== head.method || base.path !== head.path)
    out.push({ pointer: at, rule: "method-or-path-changed" });

  compareParameters(base, head, at, out);

  const baseBody = bodySchema(
    baseDoc,
    base.node.requestBody,
    `${base.pointer}/requestBody`,
  );
  const headBody = bodySchema(
    headDoc,
    head.node.requestBody,
    `${head.pointer}/requestBody`,
  );
  const baseRequired = base.requestBody?.node.required === true;
  const headRequired = head.requestBody?.node.required === true;
  if (baseBody !== undefined && headBody === undefined)
    out.push({ pointer: `${at}/requestBody`, rule: "request-removed" });
  else if (baseBody === undefined && headBody !== undefined) {
    if (headRequired)
      out.push({
        pointer: `${at}/requestBody`,
        rule: "request-required-added",
      });
  } else if (baseBody !== undefined) {
    if (!baseRequired && headRequired)
      out.push({
        pointer: `${at}/requestBody`,
        rule: "request-became-required",
      });
    compareNode(baseBody, headBody, `${at}/requestBody`, out);
  }

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
    const b = bodySchema(
      baseDoc,
      response,
      `${base.pointer}/responses/${status}`,
    );
    const h = bodySchema(
      headDoc,
      headResponses[status],
      `${head.pointer}/responses/${status}`,
    );
    if (b === undefined && h === undefined) continue;
    compareNode(b ?? false, h ?? false, where, out);
  }
}

/** A document's `x-treaty-gate-refusals`, by status. */
function gates(doc: unknown): Node {
  if (!isObject(doc)) return {};
  const declared = doc["x-treaty-gate-refusals"];
  return isObject(declared) ? declared : {};
}

function components(doc: unknown): Node {
  if (!isObject(doc) || !isObject(doc.components)) return {};
  return isObject(doc.components.schemas) ? doc.components.schemas : {};
}

/**
 * Every change from `base` to `head` that would break a client or a server of the API.
 * Operations are matched by `operationId`, or by method and path when they have none; bodies,
 * responses and parameters are compared through their `$ref`s.
 */
export function compareOpenApi(base: unknown, head: unknown): Breaking[] {
  const out: Breaking[] = [];
  const after = new Map(documentOperations(head).map((o) => [o.key, o]));
  for (const op of documentOperations(base)) {
    const next = after.get(op.key);
    if (!next) out.push({ pointer: op.pointer, rule: "operation-removed" });
    else compareOperation(base, head, op, next, out);
  }
  // A gate's refusal answers every operation, like a response status: adding one is no finding,
  // removing one or changing its body is.
  const headGates = gates(head);
  for (const [status, gate] of Object.entries(gates(base))) {
    const where = `/x-treaty-gate-refusals/${escape(status)}`;
    const next = headGates[status];
    if (!isObject(next))
      out.push({ pointer: where, rule: "gate-refusal-removed" });
    else
      compareNode(
        isObject(gate) ? gate.schema : undefined,
        next.schema,
        `${where}/schema`,
        out,
      );
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
