// PROPOSED shared-data adapter only; never a launcher, authorizer or filesystem reader.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { Validator } from "@cfworker/json-schema";
import { decodeResponse } from "./superbench-workspace-response-decode";

type RecordValue = Record<string, unknown>;
export type WorkerKind = "capsule" | "result";
const validators = {
  capsule: new Validator(
    JSON.parse(
      readFileSync(
        new URL(
          "../schemas/agentpod-local/registered-worker-capsule.v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    "2020-12",
    false,
  ),
  result: new Validator(
    JSON.parse(
      readFileSync(
        new URL(
          "../schemas/agentpod-local/registered-worker-result.v2.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    "2020-12",
    false,
  ),
};
function isRecord(v: unknown): v is RecordValue {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
export function registeredRecord(v: unknown): RecordValue {
  if (!isRecord(v)) throw new Error("registered_schema");
  return v;
}
const record = registeredRecord;
function values(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error("registered_schema");
  return v;
}
const list = (v: unknown) => values(v).map(record);
const pair = (key: string, encoded: string): [string, string] => [key, encoded];
const utf8 = new TextEncoder();
const bytes = (v: unknown) => utf8.encode(String(v)).length;
const string = (v: unknown) =>
  JSON.stringify(v).replace(
    /[<>&\u2028\u2029]/gu,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
function compareUTF8(a: string, b: string): number {
  const x = utf8.encode(a),
    y = utf8.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const left = x[i] ?? 0,
      right = y[i] ?? 0;
    if (left !== right) return left - right;
  }
  return x.length - y.length;
}
const object = (entries: [string, string][]) =>
  "{" + entries.map(([k, v]) => string(k) + ":" + v).join(",") + "}";
const map = (v: unknown) =>
  object(
    Object.entries(record(v))
      .toSorted(([a], [b]) => compareUTF8(a, b))
      .map(([k, entry]) => pair(k, string(entry))),
  );
const pick = (v: unknown, fields: string[]) =>
  object(fields.map((k) => [k, string(record(v)[k])]));
const bindingFields = ["board_id", "card_id", "run_id", "epoch"];
const node = (v: unknown) => pick(v, ["device", "inode"]);
const array = (v: unknown, encode: (v: unknown) => string) =>
  "[" + values(v).map(encode).join(",") + "]";
function task(v: unknown): string {
  const t = record(v);
  return object([
    ["version", string(t.version)],
    ["binding", pick(t.binding, bindingFields)],
    ["bench_key", string(t.bench_key)],
    ["bench_id", string(t.bench_id)],
    ["workspace_root", string(t.workspace_root)],
    ...(t.repository_name === undefined
      ? []
      : [pair("repository_name", string(t.repository_name))]),
    [
      "members",
      array(t.members, (m) =>
        pick(m, [
          "name",
          "repository_sha256",
          "task_ref",
          "object_format",
          "commit",
        ]),
      ),
    ],
    ["arguments", array(t.arguments, string)],
    ["prompt", string(t.prompt)],
    ["environment", map(t.environment)],
    ["timeout_seconds", string(t.timeout_seconds)],
  ]);
}
function layout(v: unknown): string {
  const l = record(v);
  return object([
    ["key", string(l.key)],
    ["bench_id", string(l.bench_id)],
    ["version", string(l.version)],
    ["policy_sha256", string(l.policy_sha256)],
    ["root", node(l.root)],
    ["root_home", node(l.root_home)],
    ["root_tmp", node(l.root_tmp)],
    [
      "members",
      array(l.members, (m) =>
        object([
          ["name", string(record(m).name)],
          ...["checkout", "admin", "home", "tmp"].map(
            (k) => [k, node(record(m)[k])] as [string, string],
          ),
        ]),
      ),
    ],
  ]);
}
export function canonicalRegistered(v: unknown, kind: WorkerKind): string {
  const r = record(v);
  return kind === "capsule"
    ? object([
        ["version", string(r.version)],
        ["task", task(r.task)],
        ["layout", layout(r.layout)],
      ])
    : object([
        ["version", string(r.version)],
        ["binding", pick(r.binding, bindingFields)],
        ["outcome", string(r.outcome)],
        ["handoff", map(r.handoff)],
      ]);
}
function capsuleValid(value: unknown): boolean {
  const r = record(value),
    t = record(r.task),
    l = record(r.layout),
    b = record(t.binding);
  const root = String(t.workspace_root);
  const clean = posix.normalize(root).replace(/\/$/u, "") || "/";
  if (
    root !== clean ||
    bytes(root) > 4096 ||
    posix.basename(root) !== t.bench_key ||
    posix.basename(posix.dirname(root)) !== "benches" ||
    t.bench_key !== l.key ||
    t.bench_id !== l.bench_id
  )
    return false;
  if (values(t.arguments).some((a) => bytes(a) > 8192)) return false;
  const members = list(t.members),
    nodes = [l.root, l.root_home, l.root_tmp];
  const physical = list(l.members);
  if (
    members.length !== physical.length ||
    (t.repository_name !== undefined &&
      !members.some((m) => m.name === t.repository_name))
  )
    return false;
  const repos = new Set();
  for (let i = 0; i < members.length; i++) {
    const m = members[i],
      p = physical[i];
    if (
      !m ||
      !p ||
      m.name !== p.name ||
      (i > 0 && String(members[i - 1]?.name) >= String(m.name)) ||
      repos.has(m.repository_sha256) ||
      m.task_ref !== "refs/heads/card/" + String(b.card_id)
    )
      return false;
    repos.add(m.repository_sha256);
    nodes.push(p.checkout, p.admin, p.home, p.tmp);
  }
  const seen = new Set();
  for (const n of nodes.map(record)) {
    if (
      BigInt(String(n.device)) > 18446744073709551615n ||
      BigInt(String(n.inode)) > 18446744073709551615n ||
      n.device !== record(l.root).device
    )
      return false;
    const key = String(n.device) + ":" + String(n.inode);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
export function decodeRegisteredBody(
  raw: Uint8Array,
  kind: WorkerKind,
): unknown {
  if (raw.length === 0 || raw.length > 65536)
    throw new Error("registered_size");
  const value = decodeResponse(raw);
  if (!validators[kind].validate(value).valid)
    throw new Error("registered_schema");
  if (kind === "capsule" && !capsuleValid(value))
    throw new Error("registered_semantics");
  if (new TextDecoder().decode(raw) !== canonicalRegistered(value, kind))
    throw new Error("registered_canonical");
  return value;
}
export const registeredSHA = (raw: Uint8Array) =>
  createHash("sha256").update(raw).digest("hex");
export function decodeRegisteredFrame(
  frame: Uint8Array,
  kind: WorkerKind,
  expected: string | RecordValue,
): unknown {
  if (
    frame.length < 5 ||
    frame.length > 65540 ||
    new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(
      0,
      false,
    ) !==
      frame.length - 4
  )
    throw new Error("registered_frame");
  const raw = frame.slice(4),
    result = decodeRegisteredBody(raw, kind);
  if (
    kind === "capsule" &&
    (typeof expected !== "string" ||
      !/^[a-f0-9]{64}$/u.test(expected) ||
      registeredSHA(raw) !== expected)
  )
    throw new Error("registered_digest");
  if (
    kind === "result" &&
    (typeof expected === "string" ||
      bindingFields.some(
        (k) => record(record(result).binding)[k] !== expected[k],
      ))
  )
    throw new Error("registered_binding");
  return result;
}
