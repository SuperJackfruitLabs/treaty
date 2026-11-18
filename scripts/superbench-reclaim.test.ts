import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  strictDecode,
  workspaceErrors,
  type WorkspaceRequest,
} from "./superbench-workspace-api-validation";
import { decodeResponse } from "./superbench-workspace-response-decode";
import {
  responseErrors,
  type ExpectedResponse,
} from "./superbench-workspace-response-validation";
import { observationErrors } from "./superbench-observation-validation";

const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const requests = new Validator(
  read("schemas/superbench/operation.v2.json"),
  "2020-12",
  false,
);
const responses = new Validator(
  read("schemas/superbench/response.v2.json"),
  "2020-12",
  false,
);
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("expected object");
  return value;
}
type RequestCase = {
  name: string;
  kind: "request";
  body: unknown;
  reason?: string;
};
type ResponseCase = {
  name: string;
  kind: "response";
  status: number;
  expected: ExpectedResponse;
  body: unknown;
  validation: "wire";
  reason?: string;
};
type Case = RequestCase | ResponseCase;
const vectors: {
  version: string;
  status: string;
  valid: Case[];
  invalid: Case[];
  lexical: Array<{
    name: string;
    kind: "request" | "response";
    reason: string;
    raw: string;
  }>;
} = read("fixtures/superbench-api/reclaim.json");
const lifecycle: {
  version: string;
  status: string;
  scenarios: Array<{
    name: string;
    response_case: string;
    status?: string;
    assertions: string[];
    steps?: Array<{ request_case?: string; response_case?: string }>;
  }>;
} = read("fixtures/superbench-api/reclaim-lifecycle.json");

const observations = new Validator(
  read("schemas/superbench/observation-response.v1.json"),
  "2020-12",
  false,
);
const isRequest = (body: unknown): body is WorkspaceRequest =>
  requests.validate(body).valid;

test("reclaim vectors and obligations have their own canonical plain-data addresses", () => {
  expect(vectors.version).toBe("superbench.reclaim-fixtures.v1");
  expect(vectors.status).toContain("does not prove");
  expect(lifecycle.version).toBe("superbench.reclaim-lifecycle-fixtures.v1");
  expect(lifecycle.status).toContain("does not prove");
  const names = [...vectors.valid, ...vectors.invalid, ...vectors.lexical].map(
    (c) => c.name,
  );
  expect(new Set(names).size).toBe(names.length);
  const valid = new Map(vectors.valid.map((c) => [c.name, c]));
  const scenarios = new Set<string>();
  for (const scenario of lifecycle.scenarios) {
    expect(valid.get(scenario.response_case)?.kind).toBe("response");
    expect(scenario.assertions.length).toBeGreaterThan(0);
    for (const step of scenario.steps ?? []) {
      if (step.request_case)
        expect(valid.get(step.request_case)?.kind).toBe("request");
      if (step.response_case)
        expect(valid.get(step.response_case)?.kind).toBe("response");
    }
    scenarios.add(scenario.name);
  }
  expect(scenarios.size).toBe(lifecycle.scenarios.length);
});

test("only the ruled-but-unbuilt re-creation obligation is marked PROPOSED", () => {
  const marked = lifecycle.scenarios.filter((s) => s.status !== undefined);
  expect(marked.map((s) => s.name)).toEqual(["create-after-reclaim"]);
  expect(marked[0]?.status).toStartWith("PROPOSED");
  for (const scenario of lifecycle.scenarios)
    if (scenario.status === undefined)
      expect(JSON.stringify(scenario)).not.toMatch(/proposed/iu);
});

for (const c of vectors.valid)
  test(`reclaim ${c.kind} accepts ${c.name}`, () => {
    if (c.kind === "request") {
      expect(requests.validate(c.body).errors).toEqual([]);
      if (!isRequest(c.body)) throw new Error("request failed schema");
      expect(workspaceErrors(c.body)).toEqual([]);
      expect(strictDecode(JSON.stringify(c.body))).toEqual(c.body);
    } else {
      expect(responses.validate(c.body).errors).toEqual([]);
      expect(responseErrors(c.status, c.body, c.expected)).toEqual([]);
      expect(decodeResponse(JSON.stringify(c.body))).toEqual(c.body);
    }
  });

for (const c of vectors.invalid)
  test(`reclaim ${c.kind} refuses ${c.name} through ${c.reason}`, () => {
    if (c.kind === "request") {
      expect(c.reason).toBe("schema");
      expect(requests.validate(c.body).valid).toBe(false);
    } else if (c.reason === "schema") {
      expect(responses.validate(c.body).valid).toBe(false);
    } else {
      const decoded = decodeResponse(JSON.stringify(c.body));
      expect(responses.validate(decoded).errors).toEqual([]);
      expect(responseErrors(c.status, decoded, c.expected)).toContain(
        c.reason ?? "missing_reason",
      );
    }
  });

for (const c of vectors.lexical)
  test(`reclaim ${c.kind} decoder refuses ${c.name}`, () => {
    if (c.kind === "request") {
      if (c.reason === "duplicate_key")
        expect(() => strictDecode(c.raw)).toThrow("duplicate_key");
      else expect(() => strictDecode(c.raw)).toThrow();
    } else expect(() => decodeResponse(c.raw)).toThrow();
  });

// The schema rejects these first; the semantic checks must refuse them on their
// own as well, so a client without a schema validator stays closed.
test("reclaim phases are released-only in the semantic checks without the schema", () => {
  const source = vectors.valid.find((c) => c.name === "status-reclaimed");
  if (!source || source.kind !== "response") throw new Error("missing case");
  const mutate = (change: (w: Record<string, unknown>) => void) => {
    const body = structuredClone(source.body);
    const benches = record(record(body).result).benches;
    if (!Array.isArray(benches)) throw new Error("missing inventory");
    change(record(benches[0]));
    return responseErrors(source.status, body, source.expected);
  };
  expect(mutate(() => {})).toEqual([]);
  for (const phase of ["reclaiming", "reclaimed"]) {
    expect(
      mutate((w) => {
        w.phase = phase;
        w.lease = {
          holder: "worker",
          mode: "cooperative",
          stop_requested: false,
        };
      }),
    ).toContain("reclaim_state");
    for (const [field, value] of Object.entries({
      pending: {
        generation_id: "3".repeat(32),
        manifest_sha256: "e".repeat(64),
        previous_seal: "a".repeat(40),
        members: [
          { name: "a", commit: "f".repeat(40) },
          { name: "b", commit: "d".repeat(40) },
        ],
      },
      archive: {
        archived_at: "2026-11-17T00:00:00Z",
        reap_after: "2026-11-24T00:00:00Z",
        freeze_digest: "9".repeat(64),
        automatic: false,
      },
      transfer_state: "transferred",
    }))
      expect(
        mutate((w) => {
          w.phase = phase;
          w[field] = value;
        }),
      ).toContain("reclaim_state");
    expect(
      mutate((w) => {
        w.phase = phase;
        delete w.checkpoint;
      }),
    ).toContain("checkpoint_state");
    expect(
      mutate((w) => {
        w.phase = phase;
        w.ready_for_acquisition = true;
      }),
    ).toContain("readiness");
  }
});

test("reclaim success requires the reclaimed phase, and only for reclaim", () => {
  const success = vectors.valid.find((c) => c.name === "success-reclaimed");
  if (!success || success.kind !== "response") throw new Error("missing case");
  const body = structuredClone(success.body);
  const w = record(record(record(body).result).workspace);
  w.phase = "reclaiming";
  expect(responseErrors(200, body, success.expected)).toContain("completion");
  record(body).operation = "release";
  expect(
    responseErrors(200, body, { operation: "release", key: "card" }),
  ).toEqual([]);
});

test("the reader never reports a reclaim phase as unleased or held", () => {
  const corpus: {
    valid: Array<{
      name: string;
      kind: "request" | "response";
      body: unknown;
      request?: Record<string, unknown>;
      status: number;
    }>;
  } = read("fixtures/superbench-api/observations.json");
  const source = corpus.valid.find(
    (c) => c.name === "transferred_source_blocked",
  );
  if (!source) throw new Error("missing observation case");
  const observe = (phase: string, availability: string) => {
    const body = structuredClone(source.body);
    const items = record(record(body).result).items;
    if (!Array.isArray(items)) throw new Error("missing items");
    const item = record(items[0]);
    delete item.transfer_state;
    item.phase = phase;
    item.availability = availability;
    return [
      ...observationErrors(source.kind, body, source.request, source.status),
      ...(observations.validate(body).valid ? [] : ["schema"]),
    ];
  };
  expect(observe("ready", "blocked")).toEqual([]);
  for (const phase of ["reclaiming", "reclaimed"]) {
    expect(observe(phase, "blocked")).toEqual([]);
    expect(observe(phase, "unleased")).toContain("availability");
    expect(observe(phase, "held")).toContain("availability");
  }
});
