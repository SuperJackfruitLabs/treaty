import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeObservation,
  observationErrors,
  type ReadObject,
} from "./superbench-observation-validation";
const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const schemas = {
  request: new Validator(
    read("schemas/superbench/observation-request.v1.json"),
    "2020-12",
    false,
  ),
  response: new Validator(
    read("schemas/superbench/observation-response.v1.json"),
    "2020-12",
    false,
  ),
};
type Case = {
  name: string;
  kind: "request" | "response";
  body: ReadObject;
  request?: ReadObject;
  status?: number;
  reason?: string;
};
const corpus: {
  version: string;
  status: string;
  valid: Case[];
  invalid: Case[];
  lexical: { name: string; kind: "request" | "response"; raw: string }[];
} = read("fixtures/superbench-api/observations.json");
for (const c of corpus.valid)
  test(`proposed observation accepts ${c.name}`, () => {
    expect(schemas[c.kind].validate(c.body).errors).toEqual([]);
    expect(decodeObservation(JSON.stringify(c.body), c.kind)).toEqual(c.body);
    expect(observationErrors(c.kind, c.body, c.request, c.status)).toEqual([]);
  });
for (const c of corpus.invalid)
  test(`proposed observation refuses ${c.name}`, () => {
    if (c.reason === "schema")
      expect(schemas[c.kind].validate(c.body).valid).toBe(false);
    else {
      expect(schemas[c.kind].validate(c.body).errors).toEqual([]);
      expect(observationErrors(c.kind, c.body, c.request, c.status)).toContain(
        c.reason ?? "missing_reason",
      );
    }
  });
for (const c of corpus.lexical)
  test(`observation lexical refuses ${c.name}`, () =>
    expect(() => decodeObservation(c.raw, c.kind)).toThrow());
test("proposal separates wire conformance from unexecuted producer authority and file race obligations", () => {
  expect(corpus.status).toContain("does not prove");
  const obligations = read(
    "fixtures/superbench-api/observation-producer-scenarios.json",
  );
  expect(obligations.status).toContain("unexecuted");
  expect(obligations.scenarios.length).toBeGreaterThanOrEqual(20);
  const names = [...corpus.valid, ...corpus.invalid, ...corpus.lexical].map(
    (c) => c.name,
  );
  expect(new Set(names).size).toBe(names.length);
});
test("reader envelope limits and invalid UTF8 apply before decode", () => {
  for (const kind of ["request", "response"] as const) {
    const limit = kind === "request" ? 65536 : 1048576;
    expect(decodeObservation("{}" + " ".repeat(limit - 2), kind)).toEqual({});
    expect(() => decodeObservation("{}" + " ".repeat(limit - 1), kind)).toThrow(
      "observation_size",
    );
  }
  expect(() =>
    decodeObservation(new Uint8Array([34, 255, 34]), "response"),
  ).toThrow();
});
