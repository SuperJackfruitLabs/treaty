/**
 * The rules every HTTP contract in treaty keeps. `scripts/openapi.test.ts` runs them over every
 * document under schemas/http/.
 */
import { resolvePointer, type Cases } from "./cases.ts";
import { gateRefusals, operations } from "./http.ts";
import { documentOperations } from "./openapi-doc.ts";
import type { Registry } from "./registry.ts";
import { idOf, validatorFor, type Bundle } from "./schemas.ts";

export const ERROR_SCHEMA = "schemas/common/error.v1.json";

/** The error envelopes an HTTP contract may declare with `x-treaty-error-envelope`. */
export const ERROR_ENVELOPES = [
  "error.v1",
  "flat-error.v1",
  "matrix-error.v1",
  "oauth-bearer-error.v1",
] as const;
export type ErrorEnvelope = (typeof ERROR_ENVELOPES)[number];

/**
 * Envelopes a published standard defines rather than the suite, each with the envelope its
 * owner's extension codes are recorded in. The standard's own codes are listed in the envelope
 * schema's `$defs/standardCode` and belong to no product.
 */
export const STANDARD_ENVELOPES: Partial<Record<ErrorEnvelope, ErrorEnvelope>> =
  { "oauth-bearer-error.v1": "flat-error.v1" };

/** The envelope a document declares, error.v1 when it declares none, or undefined when unknown. */
export function envelopeOf(doc: unknown): ErrorEnvelope | undefined {
  const declared = isObject(doc) ? doc["x-treaty-error-envelope"] : undefined;
  if (declared === undefined) return "error.v1";
  return ERROR_ENVELOPES.find((e) => e === declared);
}

export interface ApiCases {
  operations: Record<
    string,
    { request?: Cases; responses?: Record<string, Cases> }
  >;
  /** Cases for each refusal `x-treaty-gate-refusals` declares, by status. */
  gateRefusals?: Record<string, Cases>;
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

function errorCodes(
  bundle: Bundle,
): { code: string; owner: string; envelope: string }[] {
  const file = bundle.files.get("contracts/error-codes.json");
  if (!isObject(file) || !Array.isArray(file.codes)) return [];
  return file.codes.flatMap((c: unknown) =>
    isObject(c) && typeof c.code === "string" && typeof c.owner === "string"
      ? [
          {
            code: c.code,
            owner: c.owner,
            envelope: typeof c.envelope === "string" ? c.envelope : "error.v1",
          },
        ]
      : [],
  );
}

/** The codes a standard envelope's schema lists in `$defs/standardCode`; none for the suite's own. */
function standardCodes(bundle: Bundle, envelope: ErrorEnvelope): string[] {
  if (!STANDARD_ENVELOPES[envelope]) return [];
  const codes = resolvePointer(
    bundle.files.get(`schemas/common/${envelope}.json`),
    "/$defs/standardCode/enum",
  );
  return Array.isArray(codes)
    ? codes.filter((c): c is string => typeof c === "string")
    : [];
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

/** The code an error body carries in an envelope, or undefined. */
function codeOf(envelope: ErrorEnvelope, body: unknown): unknown {
  if (!isObject(body)) return undefined;
  if (envelope === "matrix-error.v1") return body.errcode;
  if (envelope === "error.v1")
    return isObject(body.error) ? body.error.code : undefined;
  return body.error;
}

/**
 * The rules `x-treaty-gate-refusals` keeps. A gate (an entitlement check in front of every route)
 * refuses before any operation runs, so its refusal may travel in another of the suite's
 * envelopes than the document's. Each one is declared once for the document: its status, the
 * envelope, the owner's codes recorded in that envelope, and a schema that is that envelope;
 * its cases sit under `gateRefusals` in the cases file.
 */
function checkGateRefusals(
  bundle: Bundle,
  path: string,
  doc: Record<string, unknown>,
  apiCases: ApiCases | undefined,
): string[] {
  const declared = doc["x-treaty-gate-refusals"];
  const cases = apiCases?.gateRefusals ?? {};
  if (declared === undefined)
    return Object.keys(cases).map(
      (s) => `gateRefusals ${s} has cases but no x-treaty-gate-refusals entry`,
    );
  if (!isObject(declared))
    return ["x-treaty-gate-refusals must be an object keyed by status"];
  const problems: string[] = [];
  const owner = ownerOf(path);
  const known = errorCodes(bundle);
  const pointers = gateRefusals(doc);
  for (const status of Object.keys(cases))
    if (!(status in declared))
      problems.push(
        `gateRefusals ${status} has cases but no x-treaty-gate-refusals entry`,
      );
  for (const [status, gate] of Object.entries(declared)) {
    const where = `x-treaty-gate-refusals ${status}`;
    if (!/^[45]\d\d$/.test(status))
      problems.push(`${where}: a gate refusal's status is a 4xx or 5xx`);
    if (!isObject(gate)) {
      problems.push(`${where} is not an object`);
      continue;
    }
    if (typeof gate.description !== "string" || gate.description === "")
      problems.push(`${where} has no description: say which gate refuses`);
    const envelope = ERROR_ENVELOPES.find((e) => e === gate.envelope);
    if (!envelope) {
      problems.push(
        `${where}: envelope is ${JSON.stringify(gate.envelope)}; it must be one of ${ERROR_ENVELOPES.join(", ")}`,
      );
      continue;
    }
    const schema = `schemas/common/${envelope}.json`;
    const ref =
      isObject(gate.schema) && typeof gate.schema.$ref === "string"
        ? gate.schema.$ref
        : "";
    if (new URL(ref, idOf(path)).href !== idOf(schema))
      problems.push(`${where}: its schema must be ${schema}`);
    const codes = Array.isArray(gate.codes)
      ? gate.codes.filter((c): c is string => typeof c === "string")
      : [];
    if (codes.length === 0) problems.push(`${where} names no codes`);
    const standard = standardCodes(bundle, envelope);
    const codeEnvelope = STANDARD_ENVELOPES[envelope] ?? envelope;
    for (const code of codes) {
      if (standard.includes(code)) continue;
      const mine = known.find((k) => k.code === code && k.owner === owner);
      if (!mine)
        problems.push(
          `${where}: error code ${code} is not ${owner}'s in contracts/error-codes.json`,
        );
      else if (mine.envelope !== codeEnvelope)
        problems.push(
          `${where}: error code ${code} travels in ${mine.envelope}, not ${codeEnvelope}`,
        );
    }
    const pointer = pointers[status];
    if (!pointer) continue;
    problems.push(
      ...checkCases(bundle, path, pointer, cases[status], where, true),
    );
    for (const [label, body] of Object.entries(cases[status]?.valid ?? {})) {
      const code = codeOf(envelope, body);
      if (typeof code !== "string" || !codes.includes(code))
        problems.push(
          `${where}: valid case "${label}" carries ${JSON.stringify(code)}, not a code the gate names`,
        );
    }
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
  const envelope = envelopeOf(doc);
  if (!envelope)
    problems.push(
      `x-treaty-error-envelope is ${JSON.stringify(doc["x-treaty-error-envelope"])}; it must be one of ${ERROR_ENVELOPES.join(", ")}`,
    );
  const errorSchema = `schemas/common/${envelope ?? "error.v1"}.json`;

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
  const standard = envelope ? standardCodes(bundle, envelope) : [];
  /** The envelope the owner's codes must be recorded in for this document. */
  const codeEnvelope = envelope
    ? (STANDARD_ENVELOPES[envelope] ?? envelope)
    : undefined;
  const casesFile = bundle.files.get(casesPathFor(path));
  const apiCases = isApiCases(casesFile) ? casesFile : undefined;
  if (!apiCases) problems.push(`${casesPathFor(path)} is missing`);

  for (const op of ops) {
    for (const code of op.errorCodes) {
      if (standard.includes(code)) continue;
      const mine = known.find((k) => k.code === code && k.owner === owner);
      if (!mine)
        problems.push(
          `${op.id}: error code ${code} is not ${owner}'s in contracts/error-codes.json`,
        );
      else if (codeEnvelope && mine.envelope !== codeEnvelope)
        problems.push(
          `${op.id}: error code ${code} travels in ${mine.envelope}, not ${codeEnvelope}`,
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
        if (new URL(ref, idOf(path)).href !== idOf(errorSchema))
          problems.push(
            `${op.id} ${status}: an error response must be ${errorSchema}`,
          );
        // Error cases are optional; when a document pins the fields beside a code, its cases are
        // checked as they are labelled, like a success response's.
        const errorCases = opCases?.responses?.[status];
        if (errorCases)
          problems.push(
            ...checkCases(
              bundle,
              path,
              pointer,
              errorCases,
              `${op.id} ${status}`,
              false,
            ),
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

  problems.push(...checkGateRefusals(bundle, path, doc, apiCases));

  const named = registry.crossings.some(
    (c) => c.kind === "http" && c.contract.includes(path),
  );
  if (!named)
    problems.push(`${path} is not named by an http crossing in the registry`);
  return problems;
}
