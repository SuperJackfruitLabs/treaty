import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeResponse } from "./superbench-workspace-response-decode";
import {
  responseErrors,
  type ExpectedResponse,
} from "./superbench-workspace-response-validation";

const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const schema = read("schemas/superbench/response.v2.json");
const validator = new Validator(schema, "2020-12", false);
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("expected object");
  return value;
}
type Case = {
  name: string;
  status: number;
  expected: ExpectedResponse;
  body: unknown;
  reason?: string;
  validation: "wire" | "producer";
};
const vectors: {
  version: string;
  valid: Case[];
  invalid: Case[];
  lexical: Array<{ name: string; reason: string; raw: string }>;
} = read("fixtures/superbench-api/workspace-responses.json");
const lifecycle: {
  version: string;
  status: string;
  scenarios: Array<{
    name: string;
    response_case: string;
    assertions: string[];
    steps?: Array<{
      request_case?: string;
      local_operation?: string;
      response_case?: string;
    }>;
  }>;
} = read("fixtures/superbench-api/workspace-lifecycle.json");

test("proposed response and runtime obligations have separate canonical plain-data addresses", () => {
  expect(schema.$id).toBe(
    "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/schemas/superbench/response.v2.json",
  );
  expect(vectors.version).toBe("superbench.workspace-responses-fixtures.v1");
  expect(lifecycle.version).toBe("superbench.workspace-lifecycle-fixtures.v1");
  expect(lifecycle.status).toContain("does not prove");
  const names = [...vectors.valid, ...vectors.invalid, ...vectors.lexical].map(
    (c) => c.name,
  );
  expect(new Set(names).size).toBe(names.length);
  const valid = new Set(vectors.valid.map((c) => c.name));
  const requests: {
    valid: Array<{ name: string; body: { operation: string } }>;
  } = read("fixtures/superbench-api/workspace-operations.json");
  const scenarios = new Set<string>();
  for (const scenario of lifecycle.scenarios) {
    expect(valid.has(scenario.response_case)).toBe(true);
    expect(scenario.assertions.length).toBeGreaterThan(0);
    for (const step of scenario.steps ?? []) {
      if (step.request_case) {
        const request = requests.valid.find(
          (entry) => entry.name === step.request_case,
        );
        const response = vectors.valid.find(
          (entry) => entry.name === step.response_case,
        );
        if (!request || !response)
          throw new Error("missing lifecycle template");
        expect(response.expected.operation).toBe(request.body.operation);
      } else expect(["plan-reap", "reap"]).toContain(step.local_operation);
      if (step.response_case) expect(valid.has(step.response_case)).toBe(true);
    }
    scenarios.add(scenario.name);
  }
  expect(scenarios.size).toBe(lifecycle.scenarios.length);
});
for (const c of vectors.valid)
  test(`workspace response accepts ${c.name}`, () => {
    expect(validator.validate(c.body).errors).toEqual([]);
    expect(responseErrors(c.status, c.body, c.expected)).toEqual([]);
    expect(decodeResponse(JSON.stringify(c.body))).toEqual(c.body);
  });
for (const c of vectors.invalid)
  test(`workspace response refuses ${c.name} through ${c.reason}`, () => {
    if (c.reason === "schema") {
      expect(validator.validate(c.body).valid).toBe(false);
      expect(() => {
        const decoded = decodeResponse(JSON.stringify(c.body));
        if (!validator.validate(decoded).valid) throw new Error("schema");
      }).toThrow();
    } else {
      const decoded = decodeResponse(JSON.stringify(c.body));
      expect(validator.validate(decoded).errors).toEqual([]);
      expect(responseErrors(c.status, decoded, c.expected)).toContain(
        c.reason ?? "missing_reason",
      );
    }
  });
for (const c of vectors.lexical)
  test(`workspace response decoder refuses ${c.name}`, () => {
    expect(() => decodeResponse(c.raw)).toThrow();
  });

test("decoder refuses raw invalid UTF8, deep nesting and unsafe or noninteger number tokens", () => {
  expect(() => decodeResponse(new Uint8Array([0x22, 0xff, 0x22]))).toThrow();
  expect(() => decodeResponse("[".repeat(34) + "0" + "]".repeat(34))).toThrow(
    "response_depth",
  );
  for (const raw of ["9007199254740992", "-9007199254740992", "1.0", "1e3"])
    expect(() => decodeResponse(raw)).toThrow();
});

test("response transport bound includes exact raw bytes before schema validation", () => {
  const exact = "{}" + " ".repeat((1 << 20) - 2);
  expect(decodeResponse(exact)).toEqual({});
  expect(() => decodeResponse(exact + " ")).toThrow("response_size");
});

test("maximum compact growth fixture fits reserved64KiB including JSON-escaped root and two vectors", () => {
  const source = vectors.valid.find(
    (entry) => entry.name === "create-partial-grant",
  );
  if (!source) throw new Error("missing compact fixture");
  const c = structuredClone(source);
  const result = record(record(c.body).result);
  const workspace = record(result.workspace);
  const members = Array.from({ length: 32 }, (_, i) => ({
    name: String(i).padStart(2, "0") + "a".repeat(62),
    commit: "a".repeat(64),
  }));
  result.root_path = "/" + "\u0001".repeat(4095);
  workspace.phase = "prepared";
  workspace.member_count = 32;
  workspace.checkpoint_repository = members[0]?.name;
  workspace.checkpoint = {
    generation_id: "1".repeat(32),
    manifest_sha256: "2".repeat(64),
    seal: "3".repeat(64),
    members,
  };
  workspace.pending = {
    generation_id: "4".repeat(32),
    manifest_sha256: "5".repeat(64),
    previous_seal: "3".repeat(64),
    members,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(c.body)).length;
  expect(bytes).toBeLessThanOrEqual(64 << 10);
  expect(validator.validate(c.body).errors).toEqual([]);
  expect(responseErrors(c.status, c.body, c.expected)).toEqual([]);
  result.root_path = String(result.root_path) + "a";
  expect(responseErrors(c.status, c.body, c.expected)).toContain("root_path");
});

test("oversized complete global inventory fails instead of truncating either kind", () => {
  const c = vectors.valid.find(
    (entry) => entry.name === "status-mixed-complete",
  );
  if (!c) throw new Error("missing mixed inventory fixture");
  const body: unknown = structuredClone(c.body);
  record(record(body).result).benches = Array.from(
    { length: 5000 },
    (_, i) => ({
      kind: "scalar",
      key: "key" + String(i).padStart(8, "0"),
      branch: "a".repeat(255),
      state: "active",
      quota_bytes: 0,
      quota_inodes: 0,
    }),
  );
  expect(responseErrors(200, body, c.expected)).toContain("response_size");
  expect(validator.validate(body).errors).toEqual([]);
  const unavailable = {
    version: "superbench.v2",
    operation: "status",
    ok: false,
    error: {
      code: "unavailable",
      message:
        "Complete inventory exceeds response limit; query a specific key.",
    },
  };
  expect(validator.validate(unavailable).errors).toEqual([]);
  expect(responseErrors(503, unavailable, { operation: "status" })).toEqual([]);
});

test("wire grant acceptance does not invent independent producer authority or fence knowledge", () => {
  for (const fixture of vectors.valid) {
    const expected: ExpectedResponse = {
      operation: fixture.expected.operation,
    };
    if (fixture.expected.request_id !== undefined)
      expected.request_id = fixture.expected.request_id;
    if (fixture.expected.key !== undefined) expected.key = fixture.expected.key;
    if (fixture.expected.holder !== undefined)
      expected.holder = fixture.expected.holder;
    if (fixture.expected.lease_token !== undefined)
      expected.lease_token = fixture.expected.lease_token;
    if (fixture.expected.checkpoint !== undefined)
      expected.checkpoint = fixture.expected.checkpoint;
    expect(responseErrors(fixture.status, fixture.body, expected)).toEqual([]);
  }
});
