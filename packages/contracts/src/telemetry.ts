/**
 * Telemetry conventions under schemas/telemetry/, read as data
 * (`schemas/treaty/telemetry-conventions.v1.json`).
 *
 * Attribute data, not a schema for traces: a producer's test checks what it emits, and the
 * consumer queries only the keys the conventions name. Nothing here is meant for a request path;
 * telemetry stays best-effort.
 */
import { isCases, resolvePointer, type Cases } from "./cases.ts";
import { validatorFor, type Bundle, type Result } from "./schemas.ts";

export const TELEMETRY_CONVENTIONS_SCHEMA =
  "schemas/treaty/telemetry-conventions.v1.json";

export type AttributeType = "string" | "int" | "double" | "boolean";

export interface AttributeDef {
  type: AttributeType;
  description: string;
  enum?: unknown[];
  minimum?: number;
}

export interface RecordDef {
  description: string;
  producers: string[];
  service?: string;
  required: string[];
  optional: string[];
}

export interface PropagationDef {
  description: string;
  carrier: "acp-meta" | "http-headers";
  methods: string[];
  producers: string[];
  consumers: string[];
  /** Field name → whether it is required, and the pointer to its schema within the file. */
  fields: Record<string, { required: boolean; schema: string }>;
}

export interface TelemetryConventions {
  /** Repository path of the conventions. */
  path: string;
  attributes: Record<string, AttributeDef>;
  spans: Record<string, RecordDef>;
  logs: Record<string, RecordDef>;
  propagation: Record<string, PropagationDef>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];

const escape = (token: string) =>
  token.replaceAll("~", "~0").replaceAll("/", "~1");

/** `suite.v1` → `schemas/telemetry/suite.v1.json`; a repository path stays as it is. */
export function telemetryConventionsPath(name: string): string {
  if (name.startsWith("schemas/")) return name;
  if (!/\.v[1-9][0-9]*$/.test(name))
    throw new Error(
      `name the conventions' version too: ${JSON.stringify(name)} (e.g. "${name}.v1")`,
    );
  return `schemas/telemetry/${name}.json`;
}

function attributeType(value: unknown): AttributeType {
  return value === "int" || value === "double" || value === "boolean"
    ? value
    : "string";
}

function records(node: unknown): Record<string, RecordDef> {
  const out: Record<string, RecordDef> = {};
  for (const [name, r] of Object.entries(isObject(node) ? node : {}))
    if (isObject(r))
      out[name] = {
        description: String(r.description),
        producers: strings(r.producers),
        ...(typeof r.service === "string" ? { service: r.service } : {}),
        required: strings(r.required),
        optional: strings(r.optional),
      };
  return out;
}

/**
 * The conventions a bundle holds, checked against their meta-schema. `name` is `<name>.v<N>` or
 * a repository path. Throws when the bundle lacks them or they do not hold.
 */
export function telemetryConventions(
  bundle: Bundle,
  name: string,
): TelemetryConventions {
  const path = telemetryConventionsPath(name);
  const doc = bundle.files.get(path);
  if (!isObject(doc)) throw new Error(`${path} is not in the bundle`);
  const checked = validatorFor(bundle, TELEMETRY_CONVENTIONS_SCHEMA)(doc);
  if (!checked.valid)
    throw new Error(
      `${path} is not telemetry conventions: ${checked.errors[0]}`,
    );
  const attributes: Record<string, AttributeDef> = {};
  for (const [key, a] of Object.entries(
    isObject(doc.attributes) ? doc.attributes : {},
  ))
    if (isObject(a))
      attributes[key] = {
        type: attributeType(a.type),
        description: String(a.description),
        ...(Array.isArray(a.enum) ? { enum: a.enum } : {}),
        ...(typeof a.minimum === "number" ? { minimum: a.minimum } : {}),
      };
  const propagation: Record<string, PropagationDef> = {};
  for (const [key, p] of Object.entries(
    isObject(doc.propagation) ? doc.propagation : {},
  )) {
    if (!isObject(p)) continue;
    const fields: PropagationDef["fields"] = {};
    for (const [f, def] of Object.entries(isObject(p.fields) ? p.fields : {}))
      if (isObject(def))
        fields[f] = {
          required: def.required === true,
          schema: `/propagation/${escape(key)}/fields/${escape(f)}/schema`,
        };
    propagation[key] = {
      description: String(p.description),
      carrier: p.carrier === "http-headers" ? "http-headers" : "acp-meta",
      methods: strings(p.methods),
      producers: strings(p.producers),
      consumers: strings(p.consumers),
      fields,
    };
  }
  return {
    path,
    attributes,
    spans: records(doc.spans),
    logs: records(doc.logs),
    propagation,
  };
}

function typeError(def: AttributeDef, value: unknown): string | undefined {
  switch (def.type) {
    case "string":
      if (typeof value !== "string") return "is not a string";
      break;
    case "boolean":
      if (typeof value !== "boolean") return "is not a boolean";
      break;
    case "int":
      if (typeof value !== "number" || !Number.isInteger(value))
        return "is not an int";
      break;
    case "double":
      if (typeof value !== "number" || !Number.isFinite(value))
        return "is not a double";
      break;
  }
  if (def.enum && !def.enum.includes(value))
    return `is not one of ${JSON.stringify(def.enum)}`;
  if (
    def.minimum !== undefined &&
    typeof value === "number" &&
    value < def.minimum
  )
    return `is below ${def.minimum}`;
  return undefined;
}

/**
 * Checks attributes against the conventions' types: every key they name has its type, and every
 * key `record` requires is present. Keys the conventions do not name are ignored.
 */
export function validateAttributes(
  conventions: TelemetryConventions,
  attributes: Record<string, unknown>,
  record?: RecordDef,
): Result {
  const errors: string[] = [];
  for (const key of record?.required ?? [])
    if (!(key in attributes) || attributes[key] === undefined)
      errors.push(`${key} is required`);
  for (const [key, value] of Object.entries(attributes)) {
    const def = conventions.attributes[key];
    if (!def || value === undefined) continue;
    const wrong = typeError(def, value);
    if (wrong) errors.push(`${key} ${wrong}`);
  }
  return { valid: errors.length === 0, errors };
}

/** Checks a span's attributes. A span the conventions do not name is refused. */
export function validateSpanAttributes(
  conventions: TelemetryConventions,
  span: string,
  attributes: Record<string, unknown>,
): Result {
  const record = conventions.spans[span];
  if (!record)
    return {
      valid: false,
      errors: [`${span} is not a span in ${conventions.path}`],
    };
  return validateAttributes(conventions, attributes, record);
}

/** Checks a structured log record's fields, by its message. */
export function validateLogRecord(
  conventions: TelemetryConventions,
  msg: string,
  fields: Record<string, unknown>,
): Result {
  const record = conventions.logs[msg];
  if (!record)
    return {
      valid: false,
      errors: [`${msg} is not a log record in ${conventions.path}`],
    };
  return validateAttributes(conventions, fields, record);
}

/** Checks a trace-context carrier (an ACP `_meta` object, or headers as a record) against one propagation. */
export function validatePropagation(
  bundle: Bundle,
  conventions: TelemetryConventions,
  name: string,
  carrier: unknown,
): Result {
  const def = conventions.propagation[name];
  if (!def)
    return {
      valid: false,
      errors: [`${name} is not a propagation in ${conventions.path}`],
    };
  if (!isObject(carrier))
    return { valid: false, errors: ["the carrier is an object"] };
  const errors: string[] = [];
  for (const [field, f] of Object.entries(def.fields)) {
    const value = carrier[field];
    if (value === undefined) {
      if (f.required) errors.push(`${field} is required`);
      continue;
    }
    const r = validatorFor(bundle, `${conventions.path}#${f.schema}`)(value);
    for (const e of r.errors) errors.push(`${field}: ${e}`);
  }
  return { valid: errors.length === 0, errors };
}

/** The cases file beside the conventions. */
export function telemetryCasesPath(path: string): string {
  return path
    .replace(/^schemas\//, "fixtures/")
    .replace(/\.json$/, ".cases.json");
}

/**
 * Every rule the conventions keep beyond their meta-schema: each key a record names is an
 * attribute, no key is both required and optional, and every span, log record and propagation
 * has valid and invalid cases that answer as they say.
 */
export function checkTelemetryConventions(
  bundle: Bundle,
  name: string,
): string[] {
  let conventions: TelemetryConventions;
  try {
    conventions = telemetryConventions(bundle, name);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const problems: string[] = [];
  const kinds = [
    ["spans", conventions.spans],
    ["logs", conventions.logs],
  ] as const;
  for (const [kind, recs] of kinds)
    for (const [rec, def] of Object.entries(recs)) {
      for (const key of [...def.required, ...def.optional])
        if (!conventions.attributes[key])
          problems.push(`${kind}/${rec} names ${key}, which is no attribute`);
      for (const key of def.required)
        if (def.optional.includes(key))
          problems.push(`${kind}/${rec} has ${key} both required and optional`);
    }
  const casesPath = telemetryCasesPath(conventions.path);
  const file = bundle.files.get(casesPath);
  if (!isObject(file)) return [...problems, `${casesPath} is missing`];
  const run = (
    label: string,
    pointer: string,
    check: (value: unknown) => Result,
  ) => {
    const cases: unknown = resolvePointer(file, pointer);
    if (!isCases(cases)) {
      problems.push(`${label} has no cases`);
      return;
    }
    const c: Cases = cases;
    if (Object.keys(c.valid).length === 0)
      problems.push(`${label} has no valid case`);
    if (c.invalid.length === 0) problems.push(`${label} has no invalid case`);
    for (const [l, body] of Object.entries(c.valid)) {
      const r = check(body);
      if (!r.valid)
        problems.push(`${label} refuses ${l}: ${r.errors.join("; ")}`);
    }
    for (const { why, body } of c.invalid)
      if (check(body).valid) problems.push(`${label} accepts ${why}`);
  };
  const attrs = (body: unknown): Record<string, unknown> =>
    isObject(body) ? body : {};
  for (const span of Object.keys(conventions.spans))
    run(`spans/${span}`, `/spans/${escape(span)}`, (b) =>
      isObject(b)
        ? validateSpanAttributes(conventions, span, attrs(b))
        : { valid: false, errors: ["not an object"] },
    );
  for (const msg of Object.keys(conventions.logs))
    run(`logs/${msg}`, `/logs/${escape(msg)}`, (b) =>
      isObject(b)
        ? validateLogRecord(conventions, msg, attrs(b))
        : { valid: false, errors: ["not an object"] },
    );
  for (const p of Object.keys(conventions.propagation))
    run(`propagation/${p}`, `/propagation/${escape(p)}`, (b) =>
      validatePropagation(bundle, conventions, p, b),
    );
  return problems;
}
