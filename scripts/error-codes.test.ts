import { describe, expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCTS } from "../packages/contracts/src/registry.ts";

const root = join(import.meta.dir, "..");
const readJson = (path: string) =>
  JSON.parse(readFileSync(join(root, path), "utf8"));

const RAW = "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";

interface ErrorCode {
  code: string;
  owner: string;
  envelope: "error.v1" | "flat-error.v1" | "matrix-error.v1";
  status: number;
  alsoStatus?: number[];
  meaning: string;
}
const codesSchema = new Validator(
  readJson("schemas/treaty/error-codes.v2.json"),
  "2020-12",
  false,
);
const codesFile: unknown = readJson("contracts/error-codes.json");
function isCodes(value: unknown): value is { codes: ErrorCode[] } {
  return codesSchema.validate(value).valid;
}
if (!isCodes(codesFile))
  throw new Error("contracts/error-codes.json is invalid");
const { codes } = codesFile;

describe("schemas/common/error.v1.json", () => {
  const schema = readJson("schemas/common/error.v1.json");
  const validator = new Validator(schema, "2020-12", false);
  const cases: {
    valid: Record<string, unknown>;
    invalid: { why: string; body: unknown }[];
  } = readJson("fixtures/common/error.v1.cases.json");

  test("its $id is where it is published", () => {
    expect(schema.$id).toBe(`${RAW}schemas/common/error.v1.json`);
  });

  for (const [label, body] of Object.entries(cases.valid)) {
    test(`accepts ${label}`, () => {
      expect(validator.validate(body).errors).toEqual([]);
    });
  }
  for (const { why, body } of cases.invalid) {
    test(`refuses: ${why}`, () => {
      expect(validator.validate(body).valid).toBe(false);
    });
  }
});

describe("schemas/common/flat-error.v1.json", () => {
  const schema = readJson("schemas/common/flat-error.v1.json");
  const validator = new Validator(schema, "2020-12", false);
  const cases: {
    valid: Record<string, unknown>;
    invalid: { why: string; body: unknown }[];
  } = readJson("fixtures/common/flat-error.v1.cases.json");

  for (const [label, body] of Object.entries(cases.valid)) {
    test(`accepts ${label}`, () => {
      expect(validator.validate(body).errors).toEqual([]);
    });
  }
  for (const { why, body } of cases.invalid) {
    test(`refuses: ${why}`, () => {
      expect(validator.validate(body).valid).toBe(false);
    });
  }
});

describe("schemas/common/matrix-error.v1.json", () => {
  const schema = readJson("schemas/common/matrix-error.v1.json");
  const validator = new Validator(schema, "2020-12", false);
  const cases: {
    valid: Record<string, unknown>;
    invalid: { why: string; body: unknown }[];
  } = readJson("fixtures/common/matrix-error.v1.cases.json");

  test("its $id is where it is published", () => {
    expect(schema.$id).toBe(`${RAW}schemas/common/matrix-error.v1.json`);
  });

  for (const [label, body] of Object.entries(cases.valid)) {
    test(`accepts ${label}`, () => {
      expect(validator.validate(body).errors).toEqual([]);
    });
  }
  for (const { why, body } of cases.invalid) {
    test(`refuses: ${why}`, () => {
      expect(validator.validate(body).valid).toBe(false);
    });
  }
});

/** The form a code takes in each envelope. */
const CODE_FORM: Record<ErrorCode["envelope"], RegExp> = {
  "error.v1": /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/,
  "flat-error.v1": /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  "matrix-error.v1": /^M_[A-Z_]+$/,
};

describe("contracts/error-codes.json", () => {
  test("validates against schemas/treaty/error-codes.v2.json", () => {
    expect(codesSchema.validate(codesFile).errors).toEqual([]);
  });

  test("a code is unique within its owner", () => {
    // Codes are an owner's own words: an HTTP contract names only its owner's codes
    // (packages/contracts/src/openapi-check.ts), so two products may each answer `not_permitted`.
    const names = codes.map((c) => `${c.owner} ${c.code}`);
    expect(names.length).toBe(new Set(names).size);
  });

  test("an error.v1 code is SCREAMING_SNAKE_CASE, a flat-error.v1 code snake_case and a matrix-error.v1 code M_ namespaced", () => {
    const wrong = codes.filter((c) => !CODE_FORM[c.envelope].test(c.code));
    expect(wrong).toEqual([]);
  });

  test("the code forms tell the envelopes apart", () => {
    expect(CODE_FORM["matrix-error.v1"].test("M_UNKNOWN_TOKEN")).toBe(true);
    expect(CODE_FORM["matrix-error.v1"].test("UNKNOWN_TOKEN")).toBe(false);
    expect(CODE_FORM["matrix-error.v1"].test("invalid_credential")).toBe(false);
    expect(CODE_FORM["error.v1"].test("invalid_credential")).toBe(false);
    expect(CODE_FORM["flat-error.v1"].test("M_UNKNOWN_TOKEN")).toBe(false);
  });

  test("a product's codes all travel in one envelope", () => {
    const envelopes = new Map<string, Set<string>>();
    for (const c of codes)
      envelopes.set(
        c.owner,
        (envelopes.get(c.owner) ?? new Set()).add(c.envelope),
      );
    expect([...envelopes].filter(([, e]) => e.size > 1)).toEqual([]);
  });

  test("every code is owned by a known product", () => {
    const products: readonly string[] = PRODUCTS;
    expect(codes.filter((c) => !products.includes(c.owner))).toEqual([]);
  });

  test("every status is an HTTP error status, 400 to 599", () => {
    expect(
      codes.filter((c) =>
        [c.status, ...(c.alsoStatus ?? [])].some((s) => s < 400 || s > 599),
      ),
    ).toEqual([]);
  });
});
