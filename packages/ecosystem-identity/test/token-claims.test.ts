import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Claim = {
  claim: string;
  required?: boolean;
  enum?: unknown[];
  grammar?: string;
};
const corpus = JSON.parse(
  readFileSync(
    join(
      import.meta.dir,
      "../../../fixtures/ecosystem-identity/token_claims.json",
    ),
    "utf8",
  ),
) as {
  issued: Claim[];
  standard: Claim[];
  conditional: Claim[];
  reject: Array<{ case: string; why?: string }>;
  examples: Record<string, Record<string, unknown>>;
};

const described = new Map(
  [...corpus.issued, ...corpus.standard, ...corpus.conditional].map((c) => [
    c.claim,
    c,
  ]),
);
const required = [...corpus.issued, ...corpus.standard].filter(
  (c) => c.required,
);

describe("token_claims.json agrees with itself", () => {
  test("every reject case is named once and says why", () => {
    const names = corpus.reject.map((r) => r.case);
    expect(new Set(names).size).toBe(names.length);
    for (const r of corpus.reject) expect(r.why ?? "").not.toBe("");
  });

  for (const [name, example] of Object.entries(corpus.examples)) {
    describe(`the ${name} example`, () => {
      test("carries every required claim", () => {
        for (const c of required) expect(example).toHaveProperty(c.claim);
      });

      test("carries no claim the corpus does not describe", () => {
        for (const claim of Object.keys(example))
          expect(described.has(claim)).toBe(true);
      });

      test("keeps to each claim's enum and grammar", () => {
        for (const [claim, value] of Object.entries(example)) {
          const c = described.get(claim);
          if (c?.grammar)
            for (const item of Array.isArray(value) ? value : [value])
              expect(String(item)).toMatch(new RegExp(c.grammar));
          if (c?.enum && c.claim === "ent")
            for (const product of value as string[])
              expect(c.enum).toContain(product);
          else if (c?.enum && typeof value === "string")
            expect(c.enum).toContain(value);
        }
      });

      test("lives at most 300 seconds", () => {
        expect(
          (example.exp as number) - (example.iat as number),
        ).toBeLessThanOrEqual(300);
      });
    });
  }
});
