// Proposed contract conformance adapter, not an authorization or filesystem implementation.
import { createHash } from "node:crypto";
import { decodeResponse } from "./superbench-workspace-response-decode";

export type ReadObject = Record<string, unknown>;
function isRecord(value: unknown): value is ReadObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function record(value: unknown): ReadObject {
  return isRecord(value) ? value : {};
}
function noNull(value: unknown): void {
  if (value === null) throw new Error("null");
  if (Array.isArray(value)) value.forEach(noNull);
  else if (isRecord(value)) Object.values(value).forEach(noNull);
}
export function decodeObservation(
  raw: string | Uint8Array,
  kind: "request" | "response",
): unknown {
  const length =
    typeof raw === "string" ? new TextEncoder().encode(raw).length : raw.length;
  if (length > (kind === "request" ? 65536 : 1048576))
    throw new Error("observation_size");
  const result = decodeResponse(raw);
  noNull(result);
  return result;
}
function canonicalPath(value: unknown, empty: boolean): boolean {
  if (
    typeof value !== "string" ||
    new TextEncoder().encode(value).length > 1024
  )
    return false;
  if (!value) return empty;
  return (
    !value.includes("\\") &&
    !Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:/u.test(value) &&
    value
      .split("/")
      .every(
        (part) =>
          part !== "" &&
          part !== "." &&
          part !== ".." &&
          part.toLowerCase() !== ".git",
      )
  );
}
function time(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value)
  )
    return NaN;
  const result = Date.parse(value);
  return Number.isFinite(result) &&
    new Date(result).toISOString().slice(0, 19) === value.slice(0, 19)
    ? result
    : NaN;
}
function ordered(items: unknown, property: string): boolean {
  return (
    Array.isArray(items) &&
    items.every((item, index) => {
      const value = record(item)[property];
      return (
        typeof value === "string" &&
        (index === 0 || String(record(items[index - 1])[property]) < value)
      );
    })
  );
}
function checkpointErrors(value: unknown): string[] {
  const cp = record(value);
  if (cp.kind !== "workspace") return [];
  const members = Array.isArray(cp.members) ? cp.members : [];
  const errors: string[] = [];
  if (
    !members.length ||
    !ordered(members, "name") ||
    !members.some((m) => record(m).name === cp.checkpoint_repository)
  )
    errors.push("checkpoint_vector");
  for (const member of members) {
    const m = record(member);
    if (
      typeof m.commit !== "string" ||
      m.commit.length !== (m.object_format === "sha256" ? 64 : 40)
    )
      errors.push("object_format");
  }
  const coordinator = record(
    members.find((m) => record(m).name === cp.checkpoint_repository),
  );
  if (
    typeof cp.seal !== "string" ||
    cp.seal.length !== (coordinator.object_format === "sha256" ? 64 : 40)
  )
    errors.push("seal_format");
  return errors;
}
export function observationErrors(
  kind: "request" | "response",
  value: unknown,
  request?: ReadObject,
  status = 200,
): string[] {
  const body = record(value),
    errors: string[] = [];
  if (kind === "request") {
    if (
      body.path !== undefined &&
      !canonicalPath(body.path, body.operation === "tree")
    )
      errors.push("path");
    if (
      body.operation === "inventory" &&
      (body.cursor !== undefined) !== (body.snapshot !== undefined)
    )
      errors.push("inventory_cursor");
    return errors;
  }
  if (body.ok === false) {
    const codes: Record<string, number> = {
      invalid_request: 400,
      forbidden: 403,
      not_found: 404,
      unavailable: 503,
      stale_snapshot: 409,
      snapshot_expired: 410,
      content_unavailable: 409,
    };
    if (codes[String(record(body.error).code)] !== status)
      errors.push("http_status");
    if (body.operation !== undefined && body.operation !== request?.operation)
      errors.push("operation");
    return errors;
  }
  if (status !== 200) errors.push("http_status");
  if (body.operation !== request?.operation) errors.push("operation");
  if (request?.snapshot !== undefined && body.snapshot !== request.snapshot)
    errors.push("snapshot");
  const at = time(body.observed_at),
    until = time(body.expires_at);
  if (
    !Number.isFinite(at) ||
    !Number.isFinite(until) ||
    until < at ||
    until - at > 300000
  )
    errors.push("snapshot_time");
  const r = record(body.result);
  for (const field of [
    "key",
    "bench_id",
    "member",
    "path",
    "run_id",
    "base_checkpoint",
    "offset",
  ])
    if (request?.[field] !== undefined && r[field] !== request[field])
      errors.push("identity");
  if (
    ["inventory", "checkpoints", "tree", "diff"].includes(
      String(body.operation),
    ) &&
    r.complete !== (r.next_cursor === undefined)
  )
    errors.push("page_complete");
  if (body.operation === "inventory") {
    const items = Array.isArray(r.items) ? r.items : [];
    if (!ordered(items, "key")) errors.push("inventory_order");
    for (const item of items) {
      const b = record(item),
        names = Array.isArray(b.member_names) ? b.member_names : [];
      if (
        new Set(names).size !== names.length ||
        names.some(
          (name, index) =>
            index > 0 && String(names[index - 1]) >= String(name),
        )
      )
        errors.push("member_names");
      if (b.kind === "scalar" ? names.length !== 0 : names.length === 0)
        errors.push("member_names");
      if (
        (b.transfer_state !== undefined ||
          [
            "materializing",
            "initializing",
            "prepared",
            "archived",
            "reaping",
            "reaped",
          ].includes(String(b.phase))) &&
        b.availability === "unleased"
      )
        errors.push("availability");
      if (b.pending_checkpoint === true && b.availability === "unleased")
        errors.push("availability");
      if (
        (b.availability === "held" && b.holder === undefined) ||
        (b.availability === "unleased" && b.holder !== undefined)
      )
        errors.push("holder_state");
      const holder = record(b.holder);
      if (
        (holder.source === "run" && typeof holder.run !== "string") ||
        (holder.source === "agent" && typeof holder.agent !== "string")
      )
        errors.push("holder_identity");
      if (b.checkpoint !== undefined) {
        const cp = record(b.checkpoint);
        if (cp.kind !== b.kind) errors.push("checkpoint_kind");
        errors.push(...checkpointErrors(cp));
        if (
          b.kind === "workspace" &&
          JSON.stringify(
            (Array.isArray(cp.members) ? cp.members : []).map(
              (m) => record(m).name,
            ),
          ) !== JSON.stringify(names)
        )
          errors.push("member_names");
      }
    }
  }
  if (body.operation === "checkpoints") {
    const items = Array.isArray(r.items) ? r.items : [];
    if (
      (r.coverage === "latest_only" &&
        (items.length > 1 || r.complete !== true)) ||
      (r.coverage === "unavailable" && items.length !== 0)
    )
      errors.push("history_coverage");
    const ids = items.map((item) => record(record(item).checkpoint).id);
    if (new Set(ids).size !== ids.length) errors.push("history_duplicate");
    for (const item of items) {
      const entry = record(item);
      if (
        (entry.time_source === "recorded") !==
          (entry.confirmed_at !== undefined) ||
        (entry.confirmed_at !== undefined &&
          !Number.isFinite(time(entry.confirmed_at)))
      )
        errors.push("history_time");
      errors.push(...checkpointErrors(entry.checkpoint));
    }
  }
  if (
    ["tree", "file", "diff"].includes(String(body.operation)) &&
    r.member !== request?.member
  )
    errors.push("identity");
  if (body.operation === "tree")
    for (const item of Array.isArray(r.entries) ? r.entries : []) {
      const e = record(item);
      if (!canonicalPath(e.name, false) || String(e.name).includes("/"))
        errors.push("path");
      if (e.kind === "symlink" && e.readable !== false) errors.push("symlink");
    }
  if (r.data_base64 !== undefined) {
    const raw = typeof r.data_base64 === "string" ? r.data_base64 : "";
    const bytes = Buffer.from(raw, "base64");
    if (
      bytes.toString("base64") !== raw ||
      bytes.length > 65536 ||
      bytes.length > Number(request?.length ?? 65536)
    )
      errors.push("content_size");
    if (createHash("sha256").update(bytes).digest("hex") !== r.content_sha256)
      errors.push("content_digest");
    if (body.operation === "file" || body.operation === "log") {
      const total = Number(
        body.operation === "file" ? r.total_bytes : r.observed_bytes,
      );
      const end = Number(r.offset) + bytes.length;
      if (!Number.isSafeInteger(end) || end > total)
        errors.push("content_range");
      if (r.complete !== (end === total)) errors.push("content_complete");
    }
  }
  if (body.operation === "log") {
    if (r.capture !== "sealed" && r.capture_complete !== false)
      errors.push("log_completeness");
    if (
      ["absent", "collected"].includes(String(r.capture)) &&
      (r.data_base64 !== undefined || r.content_sha256 !== undefined)
    )
      errors.push("log_unavailable");
    if (
      ["sealed", "interrupted", "unsealed"].includes(String(r.capture)) &&
      (r.data_base64 === undefined || r.content_sha256 === undefined)
    )
      errors.push("log_unavailable");
    if ((r.data_base64 !== undefined) !== (r.content_sha256 !== undefined))
      errors.push("content_digest");
    if (
      ["interrupted", "unsealed", "absent"].includes(String(r.capture)) &&
      r.outcome !== "unknown"
    )
      errors.push("log_outcome");
  }
  return errors;
}
