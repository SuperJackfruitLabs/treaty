/**
 * HTTP contracts: OpenAPI 3.1 documents under schemas/http/, read as data.
 *
 * Only `application/json` bodies are contracted. A response with no content accepts only an
 * empty body.
 */
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
    return {
      id: op.key,
      method: op.method,
      path: op.path,
      ...(request ? { request } : {}),
      requestRequired: op.requestBody?.node.required === true,
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
