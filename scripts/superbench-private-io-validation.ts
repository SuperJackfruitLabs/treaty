// Proposed conformance adapter only. This does not perform execution or authorize it.
import { Validator } from "@cfworker/json-schema";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { decodePrivate } from "./superbench-private-io-decode";
import {
  responseErrors,
  type ExpectedResponse,
} from "./superbench-workspace-response-validation";

export const IO_PROFILE = "superbench.finite-io.v1";
export const IO_CONTENT_TYPE = `application/json; profile=${IO_PROFILE}`;
export const MAX_IO = 1 << 20;
export const MAX_PROFILE_BODY = 2 << 20;
export const MAX_PROFILE_LOOKUP = 16 << 20;
type ObjectValue = Record<string, unknown>;
function isObject(value: unknown): value is ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function object(value: unknown): ObjectValue {
  if (!isObject(value)) throw new Error("object");
  return value;
}
const schemas = new Map<string, Validator>();
function schema(name: string): Validator {
  let validator = schemas.get(name);
  if (!validator) {
    validator = new Validator(
      JSON.parse(
        readFileSync(
          join(import.meta.dir, "../schemas/superbench", name),
          "utf8",
        ),
      ),
      "2020-12",
      false,
    );
    schemas.set(name, validator);
  }
  return validator;
}
function validate(name: string, value: unknown): ObjectValue {
  if (!schema(name).validate(value).valid) throw new Error("schema");
  return object(value);
}
function profile(contentType: string): void {
  const parts = contentType.split(";").map((part) => part.trim());
  const parameter = parts[1]?.split("=").map((part) => part.trim());
  const value = parameter?.[1]?.replace(/^"([^"\\]*)"$/u, "$1");
  if (
    parts.length !== 2 ||
    parts[0]?.toLowerCase() !== "application/json" ||
    parameter?.length !== 2 ||
    parameter[0]?.toLowerCase() !== "profile" ||
    value !== IO_PROFILE
  )
    throw new Error("profile");
}
export function exactBase64(value: unknown, maximum: number): Uint8Array {
  if (typeof value !== "string" || value.length > 4 * Math.ceil(maximum / 3))
    throw new Error("base64_size");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maximum || bytes.toString("base64") !== value)
    throw new Error("base64_canonical");
  return bytes;
}
export const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

export function finiteRequest(
  raw: string | Uint8Array,
  contentType: string,
): ObjectValue {
  profile(contentType);
  const request = validate(
    "finite-io-run.v2.json",
    decodePrivate(raw, MAX_PROFILE_BODY),
  );
  if (
    !Array.isArray(request.arguments) ||
    request.arguments.some(
      (argument: unknown) =>
        typeof argument !== "string" ||
        new TextEncoder().encode(argument).length > 8192,
    )
  )
    throw new Error("argument_bytes");
  exactBase64(object(request.io).stdin_base64, MAX_IO);
  return request;
}
// This ordering mirrors the proposed typed run request, not raw JSON hashing or
// the checkpoint owner's different sorted-ASCII canonical algorithm.
export function finiteRequestDigest(
  raw: string | Uint8Array,
  contentType: string,
): string {
  const request = finiteRequest(raw, contentType);
  const typed: ObjectValue = {};
  for (const field of [
    "version",
    "operation",
    "key",
    "holder",
    "request_id",
    "lease_token",
    "arguments",
    "checkpoint",
    "repository_name",
  ])
    if (request[field] !== undefined) typed[field] = request[field];
  const io = object(request.io);
  typed.io = {
    version: io.version,
    stdin_base64: io.stdin_base64,
    stdout_limit_bytes: io.stdout_limit_bytes,
  };
  const canonical = JSON.stringify(typed).replace(
    /[<>&\u2028\u2029]/gu,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return sha256(new TextEncoder().encode(canonical));
}
export function finiteResponse(
  raw: string | Uint8Array,
  contentType: string,
  request: ObjectValue,
  status: number,
  expected: ExpectedResponse,
): ObjectValue {
  profile(contentType);
  const response = validate(
    "finite-io-response.v2.json",
    decodePrivate(raw, MAX_PROFILE_BODY),
  );
  const result =
    response.result === undefined ? undefined : object(response.result);
  const io = result?.io === undefined ? undefined : object(result.io);
  const legacy = structuredClone(response);
  if (legacy.result !== undefined) delete object(legacy.result).io;
  validate("response.v2.json", legacy);
  const errors = responseErrors(status, legacy, expected);
  if (errors.length) throw new Error(errors[0]);
  if (io) {
    const code =
      response.error === undefined ? "" : object(response.error).code;
    if (response.ok !== true && code !== "operation_failed")
      throw new Error("uncertain_output");
    const bytes = exactBase64(io.stdout_base64, MAX_IO);
    if (bytes.length !== io.stdout_bytes || sha256(bytes) !== io.stdout_sha256)
      throw new Error("stdout_binding");
    if (bytes.length > Number(object(request.io).stdout_limit_bytes))
      throw new Error("stdout_limit");
  }
  return response;
}
export function finiteReceipt(
  raw: string | Uint8Array,
  contentType: string,
  target: { request_id: string; digest: string },
  originalResponse: string,
  originalStatus: number,
): ObjectValue {
  profile(contentType);
  const response = validate(
    "finite-io-receipt-response.v2.json",
    decodePrivate(raw, MAX_PROFILE_LOOKUP),
  );
  if (response.result === undefined) return response;
  const result = object(response.result);
  if (
    result.target_request_id !== target.request_id ||
    result.target_digest !== target.digest
  )
    throw new Error("lookup_target");
  if (result.state === "completed") {
    if (
      result.http_status !== originalStatus ||
      typeof result.response_body !== "string" ||
      new TextEncoder().encode(result.response_body).length >
        MAX_PROFILE_BODY ||
      result.response_body !== originalResponse
    )
      throw new Error("lookup_original");
  }
  return response;
}

export function registrationRequest(raw: string | Uint8Array): ObjectValue {
  return validate(
    "registration-observe-operation.v2.json",
    decodePrivate(raw, 65536),
  );
}
export function registrationResponse(
  raw: string | Uint8Array,
  request: ObjectValue,
  status: number,
): ObjectValue {
  const response = validate(
    "registration-observe-response.v2.json",
    decodePrivate(raw, 65536),
  );
  if (response.ok === false) {
    const code = object(response.error).code;
    const pairs: Record<string, number[]> = {
      invalid_request: [400, 405, 413, 415],
      forbidden: [403],
      not_found: [404],
      conflict: [409],
      in_progress: [409],
      operation_in_doubt: [409, 503],
      unavailable: [503],
      operation_failed: [422],
    };
    if (!(pairs[String(code)] ?? []).includes(status))
      throw new Error("http_status");
    return response;
  }
  if (status !== 200) throw new Error("http_status");
  const result = object(response.result);
  if (result.key !== request.key || result.bench_id !== request.bench_id)
    throw new Error("registration_binding");
  const rootPath = result.root_path;
  if (
    typeof rootPath !== "string" ||
    new TextEncoder().encode(rootPath).length > 4096 ||
    !posix.isAbsolute(rootPath) ||
    posix.normalize(rootPath) !== rootPath ||
    !rootPath.endsWith(`/benches/${String(request.key)}`)
  )
    throw new Error("root_path");
  if (!Array.isArray(result.members)) throw new Error("members");
  const members = result.members.map(object);
  const checkpoint = object(result.checkpoint);
  if (!Array.isArray(checkpoint.members)) throw new Error("checkpoint_members");
  const commits = checkpoint.members.map(object);
  if (
    members.length !== commits.length ||
    members.some(
      (m, i) =>
        m.name !== commits[i]?.name ||
        (i > 0 && String(members[i - 1]?.name) >= String(m.name)),
    )
  )
    throw new Error("member_vector");
  const root = object(result.root);
  const nodes = [
    root,
    object(result.root_home),
    object(result.root_tmp),
    ...members.flatMap((member) =>
      ["checkout", "admin", "home", "tmp"].map((name) => object(member[name])),
    ),
  ];
  const seen = new Set<string>();
  for (const node of nodes) {
    for (const value of [node.device, node.inode])
      if (typeof value !== "string" || BigInt(value) > 18446744073709551615n)
        throw new Error("physical_uint64");
    const id = `${String(node.device)}:${String(node.inode)}`;
    if (node.device !== root.device || seen.has(id))
      throw new Error("physical_topology");
    seen.add(id);
  }
  return response;
}
