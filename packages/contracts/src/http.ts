/**
 * HTTP contracts: OpenAPI 3.1 documents under schemas/http/, read as data.
 *
 * Only `application/json` bodies are contracted. A response with no content accepts only an
 * empty body.
 */
import { validatorFor, type Bundle, type Result } from "./schemas.ts";

const METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "head",
  "options",
] as const;
const JSON_MEDIA = "application/json";

export interface Operation {
  id: string;
  method: (typeof METHODS)[number];
  path: string;
  /** JSON pointer, within the document, to the request body's schema. */
  request?: string;
  /** Status (or `default`, `4XX`) → pointer to the body's schema, or null for no body. */
  responses: Record<string, string | null>;
  errorCodes: string[];
}

export interface Api {
  /** Repository path of the document. */
  path: string;
  operations: Operation[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Escapes one token of a JSON pointer (RFC 6901). */
function token(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function jsonSchemaPointer(
  holder: unknown,
  pointer: string,
): string | undefined {
  if (!isObject(holder) || !isObject(holder.content)) return undefined;
  const media = holder.content[JSON_MEDIA];
  if (!isObject(media) || !isObject(media.schema)) return undefined;
  return `${pointer}/content/${token(JSON_MEDIA)}/schema`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Every operation in an OpenAPI document. */
export function operations(doc: unknown): Operation[] {
  if (!isObject(doc) || !isObject(doc.paths)) return [];
  const found: Operation[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    if (!isObject(item)) continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!isObject(op) || typeof op.operationId !== "string") continue;
      const base = `/paths/${token(path)}/${method}`;
      const request = jsonSchemaPointer(op.requestBody, `${base}/requestBody`);
      const responses: Record<string, string | null> = {};
      if (isObject(op.responses)) {
        for (const [status, response] of Object.entries(op.responses)) {
          responses[status] =
            jsonSchemaPointer(response, `${base}/responses/${status}`) ?? null;
        }
      }
      found.push({
        id: op.operationId,
        method,
        path,
        ...(request ? { request } : {}),
        responses,
        errorCodes: stringArray(op["x-treaty-error-codes"]),
      });
    }
  }
  return found;
}

/** The API a document in the bundle describes. Throws if the bundle lacks the document. */
export function openApi(bundle: Bundle, path: string): Api {
  const doc = bundle.files.get(path);
  if (!isObject(doc)) throw new Error(`${path} is not in the bundle`);
  return { path, operations: operations(doc) };
}

function segments(path: string): string[] {
  const bare = path.split("?")[0] ?? "";
  return bare.split("/").filter((s) => s !== "");
}

/**
 * The operation a request reaches, or undefined. A literal segment outranks a parameter, so
 * `/cards/ready` reaches its own operation rather than `/cards/{cardId}`.
 */
export function matchRoute(
  api: Api,
  method: string,
  path: string,
): string | undefined {
  const wanted = segments(path);
  let best: { id: string; score: number } | undefined;
  for (const op of api.operations) {
    if (op.method !== method.toLowerCase()) continue;
    const template = segments(op.path);
    if (template.length !== wanted.length) continue;
    let score = 0;
    let matches = true;
    for (const [i, part] of template.entries()) {
      if (/^\{[^}]+\}$/.test(part)) score += 1;
      else if (part === wanted[i]) score += 2;
      else {
        matches = false;
        break;
      }
    }
    if (matches && (!best || score > best.score)) best = { id: op.id, score };
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
