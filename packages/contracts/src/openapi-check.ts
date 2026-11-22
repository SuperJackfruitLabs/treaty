/**
 * The rules every HTTP contract in treaty keeps. `scripts/openapi.test.ts` runs them over every
 * document under schemas/http/.
 */
import { resolvePointer, type Cases } from "./cases.ts";
import { operations } from "./http.ts";
import { documentOperations } from "./openapi-doc.ts";
import type { Registry } from "./registry.ts";
import { idOf, validatorFor, type Bundle } from "./schemas.ts";

export const ERROR_SCHEMA = "schemas/common/error.v1.json";

export interface ApiCases {
  operations: Record<
    string,
    { request?: Cases; responses?: Record<string, Cases> }
  >;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isApiCases(value: unknown): value is ApiCases {
  return isObject(value) && isObject(value.operations);
}

/** Where an API's cases live: schemas/http/a/b.v1.openapi.json → fixtures/http/a/b.v1.cases.json. */
export function casesPathFor(docPath: string): string {
  return docPath
    .replace(/^schemas\//, "fixtures/")
    .replace(/\.openapi\.json$/, ".cases.json");
}

/** The owner an HTTP contract's path names: schemas/http/<owner>/…. */
export function ownerOf(docPath: string): string {
  return docPath.split("/")[2] ?? "";
}

/** Repository path and pointer a `$ref` in `fromPath` reaches, or undefined. */
export function resolveRef(
  bundle: Bundle,
  fromPath: string,
  ref: string,
): unknown {
  const url = new URL(ref, idOf(fromPath));
  const [base = "", pointer = ""] = url.href.split("#");
  for (const [path, doc] of bundle.files) {
    const id =
      isObject(doc) && typeof doc.$id === "string" ? doc.$id : idOf(path);
    if (id === base) return resolvePointer(doc, pointer);
  }
  return undefined;
}

function refs(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) for (const n of node) refs(n, found);
  else if (isObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") found.push(value);
      else refs(value, found);
    }
  }
  return found;
}

function errorCodes(bundle: Bundle): { code: string; owner: string }[] {
  const file = bundle.files.get("contracts/error-codes.json");
  if (!isObject(file) || !Array.isArray(file.codes)) return [];
  return file.codes.flatMap((c: unknown) =>
    isObject(c) && typeof c.code === "string" && typeof c.owner === "string"
      ? [{ code: c.code, owner: c.owner }]
      : [],
  );
}

function checkCases(
  bundle: Bundle,
  path: string,
  pointer: string,
  cases: Cases | undefined,
  where: string,
  needInvalid: boolean,
): string[] {
  if (!cases || Object.keys(cases.valid).length === 0)
    return [`${where} has no valid cases`];
  const problems: string[] = [];
  if (needInvalid && cases.invalid.length === 0)
    problems.push(`${where} has no invalid cases`);
  const validate = validatorFor(bundle, `${path}#${pointer}`);
  for (const [label, body] of Object.entries(cases.valid)) {
    const r = validate(body);
    if (!r.valid)
      problems.push(`${where}: valid case "${label}" fails: ${r.errors[0]}`);
  }
  for (const { why, body } of cases.invalid) {
    if (validate(body).valid)
      problems.push(`${where}: invalid case "${why}" passes`);
  }
  return problems;
}

/** Every rule an HTTP contract breaks, as one line each. Empty means it keeps them all. */
export function checkOpenApi(
  bundle: Bundle,
  path: string,
  registry: Registry,
): string[] {
  const doc = bundle.files.get(path);
  if (!isObject(doc)) return [`${path} is not in the bundle`];
  const problems: string[] = [];
  const owner = ownerOf(path);

  if (typeof doc.openapi !== "string" || !/^3\.1\.\d+$/.test(doc.openapi))
    problems.push(`openapi is ${String(doc.openapi)}, not 3.1.x`);

  for (const ref of refs(doc)) {
    if (resolveRef(bundle, path, ref) === undefined)
      problems.push(`$ref ${ref} does not resolve`);
  }

  for (const op of documentOperations(doc))
    if (!op.operationId)
      problems.push(`${op.key} has no operationId: every operation needs one`);

  const ops = operations(doc);
  const ids = ops.map((o) => o.id);
  for (const id of new Set(ids)) {
    if (ids.filter((i) => i === id).length > 1)
      problems.push(`operationId ${id} is used twice`);
  }

  const known = errorCodes(bundle);
  const casesFile = bundle.files.get(casesPathFor(path));
  const apiCases = isApiCases(casesFile) ? casesFile : undefined;
  if (!apiCases) problems.push(`${casesPathFor(path)} is missing`);

  for (const op of ops) {
    for (const code of op.errorCodes) {
      if (!known.some((k) => k.code === code && k.owner === owner))
        problems.push(
          `${op.id}: error code ${code} is not ${owner}'s in contracts/error-codes.json`,
        );
    }
    const opCases = apiCases?.operations[op.id];
    if (op.request)
      problems.push(
        ...checkCases(
          bundle,
          path,
          op.request,
          opCases?.request,
          `${op.id} request`,
          true,
        ),
      );
    for (const [status, pointer] of Object.entries(op.responses)) {
      if (!pointer) continue;
      if (/^[45]/.test(status)) {
        const schema = resolvePointer(doc, pointer);
        const ref =
          isObject(schema) && typeof schema.$ref === "string"
            ? schema.$ref
            : "";
        if (new URL(ref, idOf(path)).href !== idOf(ERROR_SCHEMA))
          problems.push(
            `${op.id} ${status}: an error response must be ${ERROR_SCHEMA}`,
          );
        continue;
      }
      problems.push(
        ...checkCases(
          bundle,
          path,
          pointer,
          opCases?.responses?.[status],
          `${op.id} ${status}`,
          false,
        ),
      );
    }
  }

  const named = registry.crossings.some(
    (c) => c.kind === "http" && c.contract.includes(path),
  );
  if (!named)
    problems.push(`${path} is not named by an http crossing in the registry`);
  return problems;
}
