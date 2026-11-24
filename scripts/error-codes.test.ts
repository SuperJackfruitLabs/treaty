import { describe, expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  STANDARD_ENVELOPES,
  envelopeOf,
} from "../packages/contracts/src/openapi-check.ts";
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

describe("schemas/common/oauth-bearer-error.v1.json", () => {
  const schema = readJson("schemas/common/oauth-bearer-error.v1.json");
  const validator = new Validator(schema, "2020-12", false);
  const cases: {
    valid: Record<string, unknown>;
    invalid: { why: string; body: unknown }[];
  } = readJson("fixtures/common/oauth-bearer-error.v1.cases.json");

  test("its $id is where it is published", () => {
    expect(schema.$id).toBe(`${RAW}schemas/common/oauth-bearer-error.v1.json`);
  });

  test("its standard codes are RFC 6750's three", () => {
    expect(schema.$defs.standardCode.enum).toEqual([
      "invalid_request",
      "invalid_token",
      "insufficient_scope",
    ]);
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

/** The envelopes each owner's HTTP contracts declare, a standard one counted as its extension codes' envelope. */
function declaredEnvelopes(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const owner of readdirSync(join(root, "schemas/http"), {
    withFileTypes: true,
  })) {
    if (!owner.isDirectory()) continue;
    for (const file of readdirSync(join(root, "schemas/http", owner.name))) {
      if (!file.endsWith(".openapi.json")) continue;
      const envelope = envelopeOf(
        readJson(`schemas/http/${owner.name}/${file}`),
      );
      if (!envelope) continue;
      out.set(
        owner.name,
        (out.get(owner.name) ?? new Set()).add(
          STANDARD_ENVELOPES[envelope] ?? envelope,
        ),
      );
    }
  }
  return out;
}

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

  test("codes are unique", () => {
    const names = codes.map((c) => c.code);
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

  test("a product's codes travel only in envelopes its HTTP contracts declare", () => {
    const declared = declaredEnvelopes();
    expect(
      codes
        .filter((c) => !declared.get(c.owner)?.has(c.envelope))
        .map((c) => `${c.owner} ${c.code} ${c.envelope}`),
    ).toEqual([]);
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
