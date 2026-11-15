import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cancellationErrors,
  decodeCancellation,
  sourceCanonical,
} from "./superbench-cancellation-validation";
import {
  strictDecode,
  workspaceErrors,
} from "./superbench-workspace-api-validation";

const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const requestSchema = read("schemas/superbench/cancel-operation.v2.json");
const responseSchema = read("schemas/superbench/cancel-response.v2.json");
const validators = {
  request: new Validator(requestSchema, "2020-12", false),
  response: new Validator(responseSchema, "2020-12", false),
};
type Target = { target_request_id: string; target_digest: string };
type Body = {
  ok: boolean;
  result?: Target & { state: string };
  error?: { code: string; message: string };
};
type Case = {
  name: string;
  kind: "request" | "response";
  body: Body;
  request: Target;
  status: number;
  reason?: string;
};
const corpus: {
  version: string;
  status: string;
  valid: Case[];
  invalid: Case[];
  lexical: Array<{ name: string; kind: string; raw: string }>;
  producer_only: Array<{
    name: string;
    request: Target;
    body: Body;
    wire_valid: boolean;
    obligation: string;
  }>;
} = read("fixtures/superbench-api/cancellation.json");
const lifecycle: {
  version: string;
  status: string;
  scenarios: Array<{
    name: string;
    response_case: string;
    assertions: string[];
  }>;
} = read("fixtures/superbench-api/cancellation-lifecycle.json");

test("cancellation extension has independent proposed canonical data addresses", () => {
  expect(requestSchema.$id).toEndWith(
    "/schemas/superbench/cancel-operation.v2.json",
  );
  expect(responseSchema.$id).toEndWith(
    "/schemas/superbench/cancel-response.v2.json",
  );
  expect(corpus.version).toBe("superbench.cancellation-fixtures.v1");
  expect(corpus.status).toContain("does not prove");
  expect(lifecycle.version).toBe(
    "superbench.cancellation-lifecycle-fixtures.v1",
  );
  expect(lifecycle.status).toContain("does not prove");
  const names = [
    ...corpus.valid,
    ...corpus.invalid,
    ...corpus.lexical,
    ...corpus.producer_only,
  ].map((c) => c.name);
  expect(new Set(names).size).toBe(names.length);
  for (const scenario of lifecycle.scenarios) {
    expect(corpus.valid.some((c) => c.name === scenario.response_case)).toBe(
      true,
    );
    expect(scenario.assertions.length).toBeGreaterThan(0);
  }
});
for (const c of corpus.valid)
  test(`cancel accepts ${c.name}`, () => {
    expect(validators[c.kind].validate(c.body).errors).toEqual([]);
    expect(decodeCancellation(JSON.stringify(c.body))).toEqual(c.body);
    if (c.kind === "response")
      expect(cancellationErrors(c.status, c.body, c.request)).toEqual([]);
  });
for (const c of corpus.invalid)
  test(`cancel refuses ${c.name}`, () => {
    if (c.reason === "schema")
      expect(validators[c.kind].validate(c.body).valid).toBe(false);
    else {
      expect(validators[c.kind].validate(c.body).errors).toEqual([]);
      expect(cancellationErrors(c.status, c.body, c.request)).toContain(
        c.reason ?? "missing_reason",
      );
    }
  });
for (const c of corpus.lexical)
  test(`cancel lexical refuses ${c.name}`, () => {
    expect(() => decodeCancellation(c.raw)).toThrow();
  });
test("cancel decoder refuses invalid UTF8, excessive nesting and oversized raw bytes", () => {
  expect(() =>
    decodeCancellation(new Uint8Array([0x22, 0xff, 0x22])),
  ).toThrow();
  expect(() =>
    decodeCancellation("[".repeat(34) + "0" + "]".repeat(34)),
  ).toThrow();
  const exact = "{}" + " ".repeat((64 << 10) - 2);
  expect(decodeCancellation(exact)).toEqual({});
  expect(() => decodeCancellation(exact + " ")).toThrow("cancellation_size");
});
test("cancel message bound counts UTF8 bytes", () => {
  const target = {
    target_request_id: "run-example",
    target_digest: "a".repeat(64),
  };
  const body = {
    ok: false,
    error: { code: "operation_in_doubt", message: "é".repeat(129) },
  };
  expect(cancellationErrors(409, body, target)).toContain("message_bytes");
});
for (const c of corpus.producer_only)
  test(`cancel wire bytes cannot prove ${c.name}`, () => {
    expect(c.wire_valid).toBe(true);
    expect(validators.response.validate(c.body).errors).toEqual([]);
    expect(cancellationErrors(200, c.body, c.request)).toEqual([]);
    expect(c.obligation).toContain("independently");
  });

type Golden = { name: string; wire: string; canonical: string; sha256: string };
const digests: {
  version: string;
  producer_revision: string;
  vectors: Golden[];
} = read("fixtures/superbench-api/source-digests.json");
function record(
  value: unknown,
): Record<string, unknown> & { operation: string } {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("operation" in value) ||
    typeof value.operation !== "string"
  )
    throw new Error("expected source request object");
  return { ...value, operation: value.operation };
}
const sourceSchema = new Validator(
  read("schemas/superbench/operation.v2.json"),
  "2020-12",
  false,
);
const sha256 = (raw: string) =>
  createHash("sha256").update(raw, "utf8").digest("hex");
for (const c of digests.vectors)
  test(`source digest golden ${c.name}`, () => {
    const decoded = record(strictDecode(c.wire));
    expect(sourceSchema.validate(decoded).errors).toEqual([]);
    expect(workspaceErrors(decoded)).toEqual([]);
    expect(sourceCanonical(decoded)).toBe(c.canonical);
    expect(sha256(c.canonical)).toBe(c.sha256);
    expect(sha256(sourceCanonical(JSON.parse(c.canonical)))).toBe(c.sha256);
  });
test("typed source digest normalizes quota and preserves false versus omission", () => {
  expect(digests.version).toBe("superbench.source-digest-fixtures.v1");
  expect(digests.producer_revision).toMatch(/^[a-f0-9]{40}$/u);
  const find = (name: string) => {
    const c = digests.vectors.find((v) => v.name === name);
    if (!c) throw new Error("missing golden");
    return c;
  };
  expect(find("create-integer").sha256).toBe(
    find("create-equivalent-decimal").sha256,
  );
  const run = find("held-run-html-unicode-false");
  expect(run.canonical).toContain("\\u003c\\u0026\\u003e");
  expect(run.canonical).toContain("\\u2028\\u2029");
  expect(run.canonical).toContain('"checkpoint":false');
  const body = record(JSON.parse(run.wire));
  delete body.checkpoint;
  expect(sha256(sourceCanonical(body))).not.toBe(run.sha256);
  body.checkpoint = false;
  body.lease_token = "b".repeat(48);
  expect(sha256(sourceCanonical(body))).not.toBe(run.sha256);
});
