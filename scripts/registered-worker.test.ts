import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  canonicalRegistered,
  registeredRecord,
  decodeRegisteredBody,
  decodeRegisteredFrame,
  registeredSHA,
  type WorkerKind,
} from "./registered-worker-validation";
const read = (path: string) =>
  JSON.parse(readFileSync(new URL("../" + path, import.meta.url), "utf8"));
type Vector = {
  name: string;
  kind: WorkerKind;
  body: Record<string, unknown>;
  raw: string;
  sha256: string;
  header_hex: string;
};
const corpus: {
  status: string;
  valid: Vector[];
  invalid: {
    name: string;
    kind: WorkerKind;
    body: unknown;
    raw: string;
    reason: string;
  }[];
  lexical: { name: string; kind: WorkerKind; raw: string; reason: string }[];
} = read("fixtures/agentpod-local/registered-worker.json");
const utf8 = new TextEncoder();
function frame(raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(raw.length + 4);
  new DataView(out.buffer).setUint32(0, raw.length, false);
  out.set(raw, 4);
  return out;
}
for (const v of corpus.valid)
  test(`registered proposal accepts ${v.name}`, () => {
    const raw = utf8.encode(v.raw),
      framed = frame(raw);
    expect(canonicalRegistered(v.body, v.kind)).toBe(v.raw);
    expect(registeredSHA(raw)).toBe(v.sha256);
    expect(Buffer.from(framed.slice(0, 4)).toString("hex")).toBe(v.header_hex);
    expect(decodeRegisteredBody(raw, v.kind)).toEqual(v.body);
    expect(
      decodeRegisteredFrame(
        framed,
        v.kind,
        v.kind === "capsule" ? v.sha256 : registeredRecord(v.body.binding),
      ),
    ).toEqual(v.body);
  });
for (const v of corpus.invalid)
  test(`registered proposal refuses ${v.name}`, () => {
    expect(() => decodeRegisteredBody(utf8.encode(v.raw), v.kind)).toThrow(
      v.reason,
    );
  });
for (const v of corpus.lexical)
  test(`registered lexical refuses ${v.name}`, () => {
    expect(() => decodeRegisteredBody(utf8.encode(v.raw), v.kind)).toThrow(
      v.reason,
    );
  });
const sample = corpus.valid[0];
if (!sample) throw new Error("missing capsule golden");
const raw = utf8.encode(sample.raw),
  framed = frame(raw);
test("frame requires exact BE32 count, one body and EOF-equivalent capture", () => {
  for (const bad of [
    framed.slice(0, 3),
    framed.slice(0, -1),
    new Uint8Array([...framed, 0]),
    new Uint8Array([0, 1, 0, 1]),
  ])
    expect(() => decodeRegisteredFrame(bad, "capsule", sample.sha256)).toThrow(
      "registered_frame",
    );
  expect(() =>
    decodeRegisteredFrame(framed, "capsule", "0".repeat(64)),
  ).toThrow("registered_digest");
  expect(() => decodeRegisteredBody(new Uint8Array(65537), "capsule")).toThrow(
    "registered_size",
  );
});
test("result binds the original valid capsule epoch rather than granting authority", () => {
  const v = corpus.valid.find((entry) => entry.kind === "result");
  if (!v) throw new Error("missing result");
  expect(() =>
    decodeRegisteredFrame(frame(utf8.encode(v.raw)), "result", {
      ...registeredRecord(v.body.binding),
      epoch: 8,
    }),
  ).toThrow("registered_binding");
});
test("schema cannot silently erase unknown credentials before canonical comparison", () => {
  const parsed = { ...sample.body, scope: { fenced: true } };
  expect(() =>
    decodeRegisteredBody(utf8.encode(JSON.stringify(parsed)), "capsule"),
  ).toThrow("registered_schema");
});
test("private worker proposal stays out of accepted event and public reader catalogs", () => {
  expect(
    readFileSync(new URL("../schemas/catalog.json", import.meta.url), "utf8"),
  ).not.toContain("agentpod-local");
  expect(corpus.status).toContain("does not yet consume");
  expect(
    read("fixtures/agentpod-local/registered-worker-producer-scenarios.json")
      .status,
  ).toContain("unexecuted");
});

test("result frame accepts exact byte budget and refuses the next byte", () => {
  const result = corpus.valid.find((entry) => entry.kind === "result");
  if (!result) throw new Error("missing result");
  const withPadding = { ...result.body, handoff: { padding: "" } };
  const overhead = utf8.encode(
    canonicalRegistered(withPadding, "result"),
  ).length;
  withPadding.handoff.padding = "x".repeat(65536 - overhead);
  const exact = utf8.encode(canonicalRegistered(withPadding, "result"));
  expect(exact.length).toBe(65536);
  expect(
    decodeRegisteredFrame(
      frame(exact),
      "result",
      registeredRecord(result.body.binding),
    ),
  ).toEqual(withPadding);
  withPadding.handoff.padding += "x";
  expect(() =>
    decodeRegisteredFrame(
      frame(utf8.encode(canonicalRegistered(withPadding, "result"))),
      "result",
      registeredRecord(result.body.binding),
    ),
  ).toThrow("registered_frame");
});
