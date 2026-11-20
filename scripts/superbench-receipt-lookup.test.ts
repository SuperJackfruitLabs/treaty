import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sourceCanonical } from "./superbench-cancellation-validation";
import {
  decodeReceiptLookup,
  receiptLookupErrors,
  type LookupBody,
} from "./superbench-receipt-lookup-validation";

const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const requestSchema = read(
  "schemas/superbench/receipt-lookup-operation.v2.json",
);
const responseSchema = read(
  "schemas/superbench/receipt-lookup-response.v2.json",
);
const validators = {
  request: new Validator(requestSchema, "2020-12", false),
  response: new Validator(responseSchema, "2020-12", false),
};
type Case = {
  name: string;
  kind: "request" | "response";
  body: LookupBody;
  request: { target_request_id: string; target_digest: string };
  status: number;
  reason?: string;
  original_request?: Record<string, unknown>;
};
const corpus: {
  version: string;
  status: string;
  valid: Case[];
  invalid: Case[];
  lexical: { name: string; raw: string }[];
} = read("fixtures/superbench-api/receipt-lookup.json");
const lifecycle: {
  status: string;
  scenarios: { name: string; response_case: string; assertions: string[] }[];
} = read("fixtures/superbench-api/receipt-lookup-lifecycle.json");

test("read-only lookup has separate proposed owner addresses and obligations", () => {
  expect(requestSchema.$id).toEndWith("/receipt-lookup-operation.v2.json");
  expect(responseSchema.$id).toEndWith("/receipt-lookup-response.v2.json");
  expect(corpus.version).toBe("superbench.receipt-lookup-fixtures.v1");
  expect(corpus.status).toContain("does not prove");
  expect(lifecycle.status).toContain("do not prove");
  const names = [...corpus.valid, ...corpus.invalid, ...corpus.lexical].map(
    (c) => c.name,
  );
  expect(new Set(names).size).toBe(names.length);
  for (const c of lifecycle.scenarios) {
    expect(corpus.valid.some((v) => v.name === c.response_case)).toBe(true);
    expect(c.assertions.length).toBeGreaterThan(0);
  }
});
for (const c of corpus.valid)
  test(`receipt lookup accepts ${c.name}`, () => {
    expect(validators[c.kind].validate(c.body).errors).toEqual([]);
    expect(decodeReceiptLookup(JSON.stringify(c.body), c.kind)).toEqual(c.body);
    if (c.kind === "response")
      expect(receiptLookupErrors(c.status, c.body, c.request)).toEqual([]);
    if (c.original_request) {
      const target = createHash("sha256")
        .update(sourceCanonical(c.original_request))
        .digest("hex");
      expect(c.request.target_digest).toBe(target);
      expect(c.body.result?.response_body).toStartWith(" \n");
      const saved = JSON.parse(c.body.result?.response_body ?? "{}");
      expect(saved.request_id).toBe(c.request.target_request_id);
      expect(
        new Validator(
          read("schemas/superbench/response.v2.json"),
          "2020-12",
          false,
        ).validate(saved).errors,
      ).toEqual([]);
      if (saved.ok)
        expect(saved.result.grant).toBeDefined(); // Private history, never a new grant.
      else expect(saved.error.code).toBe("unavailable");
    }
  });
for (const c of corpus.invalid)
  test(`receipt lookup refuses ${c.name}`, () => {
    if (c.reason === "schema")
      expect(validators[c.kind].validate(c.body).valid).toBe(false);
    else {
      expect(validators[c.kind].validate(c.body).errors).toEqual([]);
      expect(receiptLookupErrors(c.status, c.body, c.request)).toContain(
        c.reason ?? "missing_reason",
      );
    }
  });
for (const c of corpus.lexical)
  test(`receipt lookup lexical refuses ${c.name}`, () => {
    expect(() => decodeReceiptLookup(c.raw, "request")).toThrow();
  });
test("lookup request, full envelope and original UTF8 bytes have independent hard bounds", () => {
  for (const kind of ["request", "response"] as const) {
    const limit = kind === "request" ? 64 << 10 : 512 << 10;
    const exact = "{}" + " ".repeat(limit - 2);
    expect(decodeReceiptLookup(exact, kind)).toEqual({});
    expect(() => decodeReceiptLookup(exact + " ", kind)).toThrow(
      "receipt_lookup_size",
    );
  }
  expect(() =>
    decodeReceiptLookup(new Uint8Array([34, 255, 34]), "response"),
  ).toThrow();
  const body: LookupBody = {
    ok: true,
    result: {
      target_request_id: "r",
      target_digest: "a".repeat(64),
      state: "completed",
      http_status: 200,
      response_body: "x".repeat(64 << 10),
    },
  };
  expect(
    receiptLookupErrors(200, body, {
      target_request_id: "r",
      target_digest: "a".repeat(64),
    }),
  ).toEqual([]);
  if (!body.result) throw new Error("missing bounded result");
  body.result.response_body += "x";
  expect(
    receiptLookupErrors(200, body, {
      target_request_id: "r",
      target_digest: "a".repeat(64),
    }),
  ).toContain("receipt_bytes");
});
test("a completed stored unavailable failure is a final outcome, with its own obligation", () => {
  const scenario = lifecycle.scenarios.find(
    (s) => s.name === "completed-stored-failure-is-final",
  );
  expect(scenario?.response_case).toBe("receipt-completed-original-failure");
  const stored = corpus.valid.find((c) => c.name === scenario?.response_case);
  expect(stored?.body.result?.state).toBe("completed");
  expect(stored?.body.result?.http_status).toBe(503);
  const saved = JSON.parse(stored?.body.result?.response_body ?? "{}");
  expect(saved.ok).toBe(false);
  expect(saved.error.code).toBe("unavailable");
  expect(scenario?.assertions.join(" ")).toContain(
    "never polls it as in-flight",
  );
});
