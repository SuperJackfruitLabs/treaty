// Test-only wire validation; producer/runtime obligations are separate fixtures.
import {
  decodeResponse,
  scalarStrings,
} from "./superbench-workspace-response-decode";

type Target = { target_request_id: string; target_digest: string };
export type LookupBody = {
  ok: boolean;
  result?: Target & {
    state: string;
    http_status?: number;
    response_body?: string;
  };
  error?: { code: string; message: string };
};
const failures: Record<string, number[]> = {
  invalid_request: [400, 405, 413, 415],
  forbidden: [403],
  conflict: [409],
  unavailable: [503],
};
export function receiptLookupErrors(
  status: number,
  body: LookupBody,
  target: Target,
): string[] {
  const errors: string[] = [];
  if (
    body.result &&
    (body.result.target_request_id !== target.target_request_id ||
      body.result.target_digest !== target.target_digest)
  )
    errors.push("target_binding");
  if (
    body.ok
      ? status !== 200
      : !(failures[body.error?.code ?? ""] ?? []).includes(status)
  )
    errors.push("http_status");
  if (
    body.result?.response_body !== undefined &&
    new TextEncoder().encode(body.result.response_body).length > 64 << 10
  )
    errors.push("receipt_bytes");
  if (body.error && new TextEncoder().encode(body.error.message).length > 256)
    errors.push("message_bytes");
  return errors;
}
const nonNull = (value: unknown): boolean => {
  if (value === null) return false;
  if (Array.isArray(value)) return value.every(nonNull);
  if (typeof value === "object") return Object.values(value).every(nonNull);
  return true;
};

export function decodeReceiptLookup(
  raw: string | Uint8Array,
  kind: "request" | "response",
): unknown {
  if (typeof raw === "string" && !scalarStrings(raw))
    throw new Error("unicode_scalars");
  const bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
  if (bytes.length > (kind === "request" ? 64 << 10 : 512 << 10))
    throw new Error("receipt_lookup_size");
  const decoded = decodeResponse(bytes);
  if (!nonNull(decoded)) throw new Error("null_field");
  return decoded;
}
