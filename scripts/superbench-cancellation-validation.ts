// Test-only adapters. Go and Swift consume schemas and plain fixture data, not this code.
import {
  decodeResponse,
  scalarStrings,
} from "./superbench-workspace-response-decode";

type Target = { target_request_id: string; target_digest: string };
type Observation = {
  ok: boolean;
  result?: Target & { state: string };
  error?: { code: string; message: string };
};
const failureStatus: Record<string, number[]> = {
  invalid_request: [400, 405, 413, 415],
  forbidden: [403],
  not_found: [404],
  conflict: [409],
  in_progress: [409],
  operation_in_doubt: [409, 503],
  unavailable: [503],
  operation_failed: [422],
};
export function cancellationErrors(
  status: number,
  body: Observation,
  request: Target,
): string[] {
  const errors: string[] = [];
  if (
    body.result &&
    (body.result.target_request_id !== request.target_request_id ||
      body.result.target_digest !== request.target_digest)
  )
    errors.push("target_binding");
  if (
    body.ok
      ? status !== 200
      : !(failureStatus[body.error?.code ?? ""] ?? []).includes(status)
  )
    errors.push("http_status");
  if (body.error && new TextEncoder().encode(body.error.message).length > 256)
    errors.push("message_bytes");
  return errors;
}

export function decodeCancellation(raw: string | Uint8Array): unknown {
  if (typeof raw === "string" && !scalarStrings(raw))
    throw new Error("unicode_scalars");
  const bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
  if (bytes.length > 64 << 10) throw new Error("cancellation_size");
  return decodeResponse(bytes);
}

// Mirrors the explicitly pinned Go struct order/omitempty rules solely for golden tests.
// It is not RFC8785 and must never certify cancellation or execution authority.
export function sourceCanonical(body: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const field of [
    "version",
    "operation",
    "key",
    "repositories",
    "checkpoint_repository",
    "source",
    "holder",
    "request_id",
    "lease_token",
    "arguments",
    "checkpoint",
    "initialize",
    "offline",
    "repository_name",
    "quota_bytes",
  ]) {
    let value = body[field];
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    )
      continue;
    if (field === "repositories" && Array.isArray(value)) {
      value = value.map((entry: Record<string, unknown>) => {
        const member: Record<string, unknown> = {};
        for (const key of ["name", "repository", "branch", "base"])
          if (entry[key] !== undefined && entry[key] !== "")
            member[key] = entry[key];
        return member;
      });
    }
    if (
      field === "source" &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const entries = new Map(Object.entries(value));
      value = Object.fromEntries(
        ["repository", "bench_id", "commit", "manifest_sha256"].map((key) => [
          key,
          entries.get(key),
        ]),
      );
    }
    ordered[field] = value;
  }
  return JSON.stringify(ordered).replace(
    /[<>&\u2028\u2029]/gu,
    (character) =>
      "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
