/**
 * The AgentPod–Salaam rules JSON Schema cannot state: a station file receipt answers the request
 * it was sent for, an MCP assignment names one station on one proxy with one key, a work
 * admission compared with what was admitted, and the digests Salaam computes. Each mirrors the
 * code that ships (salaam:src/agentpod/station-files.ts, src/mcp/protocol.ts,
 * src/core/agentpod-work-protocol.ts, src/core/protocol.ts; agentpod:packages/contract/src/
 * salaam-mcp.ts, salaam-work.ts), so the corpora in fixtures/agentpod-salaam/ can be checked
 * whole.
 */
import { createHash } from "node:crypto";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Salaam's canonical JSON: keys sorted at every depth (salaam:src/core/protocol.ts canonical). */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .toSorted()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** The SHA-256 of a value's canonical JSON, as Salaam digests a binding, plan or decision. */
export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/** The SHA-256 of text's UTF-8 bytes, as the station helper hashes file content. */
export function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Why a station file receipt does not answer its request, or null. The receipt's own shape is
 * the schema's; this is what Salaam checks against the request it sent.
 */
export function receiptMismatch(request: Json, receipt: Json): string | null {
  if (receipt.root_identity !== request.root_identity)
    return "the receipt names another root";
  const action = request.action;
  if (action === "read") {
    if (receipt.path !== request.path) return "the read answers another path";
    if (typeof receipt.content !== "string") return "the read has no content";
    if (Buffer.byteLength(receipt.content) > 256 * 1024)
      return "the read is over 256 KiB";
    if (receipt.sha256 !== textHash(receipt.content))
      return "the read's sha256 is not its content's";
  }
  if (action === "patch") {
    if (receipt.path !== request.path) return "the patch answers another path";
    if (receipt.before_tree_digest !== request.expected_tree)
      return "the patch started from another tree";
    const want =
      typeof request.content === "string" ? textHash(request.content) : null;
    if (receipt.sha256 !== want)
      return "the patch's sha256 is not the content it was sent";
    if ("created_directories" in receipt) {
      const why = createdParentsMismatch(
        String(request.path),
        receipt.created_directories,
        request.content,
      );
      if (why) return why;
    }
  }
  if (action === "snapshot") {
    if (receipt.snapshot !== request.snapshot)
      return "the snapshot answers another directory";
    if (receipt.tree_digest !== request.expected_tree)
      return "the snapshot is of another tree";
  }
  return null;
}

/**
 * A new file's created parents are a non-empty, in-order run of the path's own ancestors that
 * ends at its parent (salaam:src/agentpod/station-files.ts createdParents).
 */
function createdParentsMismatch(
  path: string,
  dirs: unknown,
  content: unknown,
): string | null {
  if (typeof content !== "string")
    return "only a new file creates parent directories";
  if (!Array.isArray(dirs) || dirs.length === 0)
    return "created directories are a non-empty list";
  const parts = path.split("/");
  if (
    parts.length < 2 ||
    parts.some((p) => p === "" || p === "." || p === "..")
  )
    return "the path has no parent beneath the root";
  const ancestors = parts
    .slice(0, -1)
    .map((_, i) => parts.slice(0, i + 1).join("/"));
  const tail = ancestors.slice(ancestors.length - dirs.length);
  if (dirs.length > ancestors.length || !dirs.every((d, i) => d === tail[i]))
    return "created directories are not the path's own ancestors, in order, ending at its parent";
  return null;
}

/** A canonical literal loopback origin with a port (both sides' `proxyOrigin`). */
function proxyOrigin(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "http:" &&
      ["127.0.0.1", "[::1]"].includes(u.hostname) &&
      u.port !== "" &&
      u.username === "" &&
      u.password === "" &&
      u.origin === value
    );
  } catch {
    return false;
  }
}

/**
 * Why an MCP assignment does not name one station on one managed proxy with one key, or null
 * (agentpod:packages/contract/src/salaam-mcp.ts SalaamMcpAssignment's refinement; Salaam's
 * mcpAssignment keeps the same rule). That the digest segment is the binding's own is checked
 * at admission, not here.
 */
export function assignmentMismatch(assignment: Json): string | null {
  const binding = isObject(assignment.binding) ? assignment.binding : {};
  const servers = Array.isArray(assignment.servers) ? assignment.servers : [];
  const origins = new Set<string>();
  const keys = new Set<string>();
  for (const server of servers) {
    if (!isObject(server)) return "a server is not an object";
    const url = String(server.url);
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return "a server URL does not parse";
    }
    const parts = u.pathname.split("/");
    if (
      !proxyOrigin(u.origin) ||
      u.search !== "" ||
      u.hash !== "" ||
      u.href !== url ||
      url !== u.origin + u.pathname
    )
      return "a server URL is not canonical on a loopback proxy";
    if (
      parts.length !== 6 ||
      parts[1] !== "stations" ||
      decodeURIComponent(parts[2] ?? "") !== binding.station_id ||
      parts[3] !== "mcp-managed-v1" ||
      !/^[a-f0-9]{64}$/.test(parts[4] ?? "") ||
      parts[5] !== (server.name === "agentpod" ? "hub" : "superlibrary")
    )
      return "a server URL is not this station's managed route for its server";
    origins.add(u.origin);
    const header: unknown = Array.isArray(server.headers)
      ? server.headers[0]
      : undefined;
    if (isObject(header)) keys.add(String(header.value));
  }
  if (origins.size !== 1) return "the servers are on more than one proxy";
  if (keys.size !== 1) return "the servers carry more than one key";
  return null;
}

/** A schema check for one of the corpus's shapes. */
export type Check = (value: unknown) => boolean;

/**
 * Comparing a new work admission with the authority and work that were admitted, as both sides
 * do (checkAgentPodWorkAdmission, checkSalaamWorkAdmission): the first code that applies.
 */
export function checkWorkAdmission(
  value: unknown,
  expected: unknown,
  admission: Check,
  binding: Check,
): string {
  if (!admission(value) || !isObject(value)) return "invalid_work_admission";
  if (!binding(expected) || !isObject(expected)) return "invalid_work_binding";
  if (canonical(value.binding) !== canonical(expected.binding))
    return "work_authority_mismatch";
  if (canonical(value.work) !== canonical(expected.work))
    return "work_input_mismatch";
  return "accepted";
}

/** Comparing a request with the saved one under the same id (checkAgentPodWorkReplay). */
export function checkWorkReplay(
  value: unknown,
  saved: unknown,
  admission: Check,
): string {
  if (!admission(value)) return "invalid_work_admission";
  if (!admission(saved)) return "invalid_work_record";
  return canonical(value) === canonical(saved)
    ? "replay"
    : "work_request_conflict";
}

const names = (list: unknown[]) => list.map((x) => (isObject(x) ? x.name : x));
const repeated = (list: unknown[]) => new Set(list).size !== list.length;

/**
 * The `x-uniqueBy: ["name"]` rule of an MCP profile, assignment or readiness receipt: server
 * names are unique, and so are each server's tool names. Null when they are.
 */
export function duplicateName(value: unknown): string | null {
  const servers =
    isObject(value) && Array.isArray(value.servers) ? value.servers : [];
  if (repeated(names(servers))) return "a server is named twice";
  for (const s of servers)
    if (isObject(s) && Array.isArray(s.tools) && repeated(names(s.tools)))
      return `server ${String(s.name)} names a tool twice`;
  return null;
}
