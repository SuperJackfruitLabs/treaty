/**
 * HTTP contracts: OpenAPI 3.1 documents under schemas/http/, read as data.
 *
 * Only `application/json` bodies are contracted. A response with no content accepts only an
 * empty body.
 */
import { resolvePointer } from "./cases.ts";
import {
  bodySchemaPointer,
  documentOperations,
  isObject,
  type Method,
} from "./openapi-doc.ts";
import { validatorFor, type Bundle, type Result } from "./schemas.ts";

export interface Operation {
  /** `operationId`, or `METHOD path` when the document gives none. */
  id: string;
  method: Method;
  path: string;
  /** JSON pointer, within the document, to the request body's schema. */
  request?: string;
  /** Whether a request must carry a body (`requestBody.required`, false by default as in OpenAPI). */
  requestRequired: boolean;
  /** Status (or `default`, `4XX`) → pointer to the body's schema, or null for no body. */
  responses: Record<string, string | null>;
  errorCodes: string[];
  /** Path, query and header parameters, path-level ones merged in; the operation's own win. */
  parameters?: Parameter[];
}

export interface Parameter {
  in: "path" | "query" | "header" | "cookie";
  name: string;
  required: boolean;
  /** JSON pointer, within the document, to the parameter's schema. */
  schema?: string;
}

export interface Api {
  /** Repository path of the document. */
  path: string;
  operations: Operation[];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Every operation in an OpenAPI document, with `$ref`'d bodies followed to their schemas. */
export function operations(doc: unknown): Operation[] {
  return documentOperations(doc).map((op) => {
    const request = bodySchemaPointer(
      doc,
      op.node.requestBody,
      `${op.pointer}/requestBody`,
    );
    const responses: Record<string, string | null> = {};
    if (isObject(op.node.responses))
      for (const [status, response] of Object.entries(op.node.responses))
        responses[status] =
          bodySchemaPointer(
            doc,
            response,
            `${op.pointer}/responses/${status}`,
          ) ?? null;
    const parameters: Parameter[] = [];
    for (const [key, param] of op.parameters) {
      const where = param.in;
      if (
        where !== "path" &&
        where !== "query" &&
        where !== "header" &&
        where !== "cookie"
      )
        continue;
      const at = op.parameterPointers.get(key);
      parameters.push({
        in: where,
        name: String(param.name),
        // A path parameter is always required (OpenAPI 3.1 §4.8.12.1).
        required: where === "path" || param.required === true,
        ...(at && isObject(param.schema) ? { schema: `${at}/schema` } : {}),
      });
    }
    return {
      id: op.key,
      method: op.method,
      path: op.path,
      ...(request ? { request } : {}),
      requestRequired: op.requestBody?.node.required === true,
      parameters,
      responses,
      errorCodes: stringArray(op.node["x-treaty-error-codes"]),
    };
  });
}

/** The API a document in the bundle describes. Throws if the bundle lacks the document. */
export function openApi(bundle: Bundle, path: string): Api {
  const doc = bundle.files.get(path);
  if (!isObject(doc)) throw new Error(`${path} is not in the bundle`);
  return { path, operations: operations(doc) };
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function segments(path: string): string[] {
  const bare = path.split(/[?#]/)[0] ?? "";
  return bare
    .split("/")
    .filter((s) => s !== "")
    .map(decode);
}

const escapeRegex = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How well one template segment matches one request segment: 3 literal, 2 partial, 1 parameter, 0 none. */
function segmentScore(template: string, actual: string): number {
  if (!template.includes("{")) return template === actual ? 3 : 0;
  if (/^\{[^}]+\}$/.test(template)) return 1;
  const pattern = template
    .split(/(\{[^}]+\})/)
    .map((part) => (/^\{[^}]+\}$/.test(part) ? "[^/]+" : escapeRegex(part)))
    .join("");
  return new RegExp(`^${pattern}$`).test(actual) ? 2 : 0;
}

function sum(xs: number[]): number {
  return xs.reduce((x, y) => x + y, 0);
}

/**
 * Whether one match outranks another: the higher total wins, and on a tie the match that is more
 * literal earlier in the path, so the result never depends on the order of the document.
 */
function outranks(a: number[], b: number[]): boolean {
  if (sum(a) !== sum(b)) return sum(a) > sum(b);
  for (const [i, score] of a.entries()) {
    const other = b[i] ?? 0;
    if (score !== other) return score > other;
  }
  return false;
}

/**
 * The operation a request reaches, or undefined. Segments are compared decoded. A literal
 * segment outranks one with a parameter inside it, which outranks a bare parameter, so
 * `/cards/ready` reaches its own operation rather than `/cards/{cardId}`.
 */
export function matchRoute(
  api: Api,
  method: string,
  path: string,
): string | undefined {
  const wanted = segments(path);
  let best: { id: string; scores: number[] } | undefined;
  for (const op of api.operations) {
    if (op.method !== method.toLowerCase()) continue;
    const template = segments(op.path);
    if (template.length !== wanted.length) continue;
    const scores = template.map((part, i) =>
      segmentScore(part, wanted[i] ?? ""),
    );
    if (scores.includes(0)) continue;
    if (!best || outranks(scores, best.scores)) best = { id: op.id, scores };
  }
  return best?.id;
}

function find(api: Api, operationId: string): Operation {
  const op = api.operations.find((o) => o.id === operationId);
  if (!op) throw new Error(`${api.path} has no operation ${operationId}`);
  return op;
}

const empty = (body: unknown) =>
  body === undefined || body === null || body === "";

function check(
  bundle: Bundle,
  api: Api,
  pointer: string | null | undefined,
  body: unknown,
  what: string,
): Result {
  if (!pointer)
    return empty(body)
      ? { valid: true, errors: [] }
      : { valid: false, errors: [`${what} has no body in the contract`] };
  return validatorFor(bundle, `${api.path}#${pointer}`)(body);
}

export function validateRequest(
  bundle: Bundle,
  api: Api,
  operationId: string,
  body: unknown,
): Result {
  const op = find(api, operationId);
  if (op.request && empty(body))
    return op.requestRequired
      ? { valid: false, errors: [`${operationId} requires a body`] }
      : { valid: true, errors: [] };
  return check(bundle, api, op.request, body, `${operationId}'s request`);
}

export function validateResponse(
  bundle: Bundle,
  api: Api,
  operationId: string,
  status: number,
  body: unknown,
): Result {
  const op = find(api, operationId);
  const key = String(status);
  const range = `${key[0] ?? ""}XX`;
  const pointer =
    key in op.responses
      ? op.responses[key]
      : range in op.responses
        ? op.responses[range]
        : "default" in op.responses
          ? op.responses.default
          : undefined;
  if (pointer === undefined)
    return {
      valid: false,
      errors: [`status ${key} is not in the contract for ${operationId}`],
    };
  return check(bundle, api, pointer, body, `${operationId}'s ${key}`);
}

export interface ParameterValues {
  path?: Record<string, string>;
  /** A repeated query key arrives as an array. */
  query?: Record<string, string | string[]>;
  /** Header names compare case-insensitively. */
  header?: Record<string, string>;
}

function schemaType(schema: unknown): string[] {
  if (!isObject(schema)) return [];
  const t = schema.type;
  return Array.isArray(t)
    ? t.filter((x): x is string => typeof x === "string")
    : typeof t === "string"
      ? [t]
      : [];
}

/** A value from a URL is text; turn it into what its schema says, or leave it for the validator to refuse. */
function convert(raw: string, schema: unknown): unknown {
  const types = schemaType(schema);
  if (
    (types.includes("integer") || types.includes("number")) &&
    /^-?\d+(\.\d+)?$/.test(raw)
  )
    return Number(raw);
  if (types.includes("boolean") && (raw === "true" || raw === "false"))
    return raw === "true";
  return raw;
}

function rawValue(
  values: ParameterValues,
  param: Parameter,
): string | string[] | undefined {
  if (param.in === "path") return values.path?.[param.name];
  if (param.in === "query") return values.query?.[param.name];
  if (param.in === "header") {
    const want = param.name.toLowerCase();
    const found = Object.entries(values.header ?? {}).find(
      ([k]) => k.toLowerCase() === want,
    );
    return found?.[1];
  }
  return undefined;
}

/**
 * Checks a request's path, query and header values against an operation's parameters. Values
 * arrive as text and are converted to their schema's type first; a parameter the contract does
 * not name is ignored, as readers ignore what they do not know.
 */
export function validateParameters(
  bundle: Bundle,
  api: Api,
  operationId: string,
  values: ParameterValues,
): Result {
  const op = find(api, operationId);
  const doc = bundle.files.get(api.path);
  const errors: string[] = [];
  for (const param of op.parameters ?? []) {
    const raw = rawValue(values, param);
    const label = `${param.in} parameter ${param.name}`;
    if (raw === undefined) {
      if (param.required) errors.push(`${label} is required`);
      continue;
    }
    if (!param.schema) continue;
    const schema = resolvePointer(doc, param.schema);
    const value = schemaType(schema).includes("array")
      ? (Array.isArray(raw) ? raw : [raw]).map((v) =>
          convert(v, isObject(schema) ? schema.items : undefined),
        )
      : convert(Array.isArray(raw) ? (raw[0] ?? "") : raw, schema);
    const result = validatorFor(bundle, `${api.path}#${param.schema}`)(value);
    for (const e of result.errors) errors.push(`${label}: ${e}`);
  }
  return { valid: errors.length === 0, errors };
}

/** The operation a request reaches and its path parameter values, decoded; or undefined. */
export function routeParams(
  api: Api,
  method: string,
  path: string,
): { operationId: string; path: Record<string, string> } | undefined {
  const operationId = matchRoute(api, method, path);
  if (!operationId) return undefined;
  const op = find(api, operationId);
  const template = segments(op.path);
  const actual = segments(path);
  const values: Record<string, string> = {};
  for (const [i, part] of template.entries()) {
    if (!part.includes("{")) continue;
    const names: string[] = [];
    const pattern = part
      .split(/(\{[^}]+\})/)
      .map((piece) => {
        const m = /^\{([^}]+)\}$/.exec(piece);
        if (m?.[1]) {
          names.push(m[1]);
          return "([^/]+)";
        }
        return escapeRegex(piece);
      })
      .join("");
    const match = new RegExp(`^${pattern}$`).exec(actual[i] ?? "");
    for (const [j, name] of names.entries()) {
      const v = match?.[j + 1];
      if (v !== undefined) values[name] = v;
    }
  }
  return { operationId, path: values };
}
