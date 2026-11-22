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
  status: number;
  meaning: string;
}
const codesSchema = new Validator(
  readJson("schemas/treaty/error-codes.v1.json"),
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

describe("contracts/error-codes.json", () => {
  test("validates against schemas/treaty/error-codes.v1.json", () => {
    expect(codesSchema.validate(codesFile).errors).toEqual([]);
  });

  test("codes are unique", () => {
    const names = codes.map((c) => c.code);
    expect(names.length).toBe(new Set(names).size);
  });

  test("codes are SCREAMING_SNAKE_CASE", () => {
    expect(
      codes.filter((c) => !/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(c.code)),
    ).toEqual([]);
  });

  test("every code is owned by a known product", () => {
    const products: readonly string[] = PRODUCTS;
    expect(codes.filter((c) => !products.includes(c.owner))).toEqual([]);
  });

  test("status is an HTTP error status, 400 to 599", () => {
    expect(codes.filter((c) => c.status < 400 || c.status > 599)).toEqual([]);
  });
});
