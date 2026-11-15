import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) =>
  JSON.parse(readFileSync(join(root, path), "utf8"));
const directory = "schemas/superpipeline-api";
const fixtures = "fixtures/superpipeline-run-checkpoint";
const corpus = read(`${fixtures}/cases.json`);
const vectors: Array<{
  name: string;
  value: unknown;
  canonical: string;
  sha256: string;
}> = read(`${fixtures}/canonical.json`).cases;
const groups = [
  ["run-checkpoint.v1.json", corpus.structural],
  ["checkpoint-settlement.v1.json", corpus.submission],
  ["run-checkpoint-receipt.v1.json", corpus.reply],
] as const;

for (const [file, cases] of groups) {
  const validator = new Validator(
    read(`${directory}/${file}`),
    "2020-12",
    false,
  );
  for (const item of cases.accept) {
    test(`${file}: accepts ${item.name}`, () => {
      expect(validator.validate(item.body).errors).toEqual([]);
    });
  }
  for (const item of cases.reject) {
    test(`${file}: refuses ${item.name}`, () => {
      expect(validator.validate(item.body).valid).toBe(false);
    });
  }
}

test("proposed HTTP schemas have exact publication identities, separate from events", () => {
  expect(readdirSync(join(root, directory)).toSorted()).toEqual([
    "checkpoint-settlement.v1.json",
    "run-checkpoint-policy.v1.json",
    "run-checkpoint-receipt.v1.json",
    "run-checkpoint.v1.json",
  ]);
  for (const file of readdirSync(join(root, directory))) {
    expect(read(`${directory}/${file}`).$id).toBe(
      `https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/${directory}/${file}`,
    );
  }
});

for (const [schema, body] of [
  [
    `${directory}/run-checkpoint-policy.v1.json`,
    corpus.producerBaseline.policy,
  ],
  [
    "schemas/superbench/operation.v2.json",
    corpus.producerBaseline.originalSourceRequest,
  ],
  [
    "schemas/superbench/response.v2.json",
    corpus.producerBaseline.validatedSourceResponse,
  ],
] as const) {
  test(`source fixture conforms to ${schema}`, () => {
    expect(
      new Validator(read(schema), "2020-12", false).validate(body).errors,
    ).toEqual([]);
  });
}

// Independent implementation of the proposal's ASCII canonical form; the vectors
// were generated separately in Python. This is a test adapter, not a wire parser.
function quote(value: string): string {
  let result = '"';
  for (const scalar of value) {
    const code = scalar.codePointAt(0) ?? 0;
    if (code >= 0xd800 && code <= 0xdfff) throw new Error("unpaired surrogate");
    if (scalar === '"' || scalar === "\\") result += "\\" + scalar;
    else if (code >= 32 && code <= 126) result += scalar;
    else
      for (const unit of scalar.split("")) {
        result += "\\u" + unit.charCodeAt(0).toString(16).padStart(4, "0");
      }
  }
  return result + '"';
}
function canonical(value: unknown): string {
  if (typeof value === "string") return quote(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.entries(value)
        .toSorted(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
        .map(([key, item]) => quote(key) + ":" + canonical(item))
        .join(",") +
      "}"
    );
  }
  throw new Error("unsupported canonical value");
}
for (const vector of vectors) {
  test(`independent canonical digest: ${vector.name}`, () => {
    const raw = canonical(vector.value);
    expect(raw).toBe(vector.canonical);
    expect(createHash("sha256").update(raw).digest("hex")).toBe(vector.sha256);
  });
}
test("canonical encoding refuses unsupported values and unpaired surrogates", () => {
  for (const value of [null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "\ud800"]) {
    expect(() => canonical(value)).toThrow();
  }
});
test("producer-state cases stay explicitly unexecuted by schema validation", () => {
  const scenarios = read(`${fixtures}/producer-scenarios.json`);
  expect(scenarios.status).toBe("proposal; not executed product conformance");
  expect(scenarios.cases).toHaveLength(23);
  expect(
    new Set(scenarios.cases.map((item: { name: string }) => item.name)).size,
  ).toBe(23);
});
