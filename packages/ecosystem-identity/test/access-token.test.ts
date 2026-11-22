import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCESS_TOKEN_ERROR_CODES,
  AccessTokenError,
  verifyAccessToken,
} from "../src/index.ts";

interface Vector {
  name: string;
  token: string;
  verifier: { issuer: string; audience: string; product: string; now: number };
  expect: { ok: true; claims: unknown } | { ok: false; code: string };
}

const file: {
  jwks: { keys: unknown[] };
  cases: Vector[];
  refusalCodes: Array<{ code: string }>;
} = JSON.parse(
  readFileSync(
    join(
      import.meta.dir,
      "../../../fixtures/ecosystem-identity/token_vectors.json",
    ),
    "utf8",
  ),
);

async function outcome(
  v: Vector,
): Promise<{ ok: boolean; claims?: unknown; code?: string }> {
  try {
    return {
      ok: true,
      claims: await verifyAccessToken(v.token, {
        jwks: file.jwks,
        ...v.verifier,
      }),
    };
  } catch (e) {
    if (e instanceof AccessTokenError) return { ok: false, code: e.code };
    throw e;
  }
}

describe("every token vector", () => {
  for (const v of file.cases)
    test(`${v.name} → ${v.expect.ok ? "ok" : v.expect.code}`, async () => {
      expect(await outcome(v)).toEqual(v.expect);
    });
});

test("the verifier's codes are the vectors' closed set", () => {
  expect<string[]>([...ACCESS_TOKEN_ERROR_CODES]).toEqual(
    file.refusalCodes.map((c) => c.code),
  );
});

test("now defaults to the clock: a vector token from 2026 is long expired", async () => {
  const v = file.cases.find((c) => c.name === "example-service");
  if (!v) throw new Error("no example-service vector");
  const { now: _now, ...rest } = v.verifier;
  const err = await verifyAccessToken(v.token, {
    jwks: file.jwks,
    ...rest,
  }).catch((e: unknown) => e);
  expect(err instanceof AccessTokenError && err.code).toBe("expired");
});

// Each rule below is held by vectors on both sides of its line, so removing the rule, or moving
// the line, turns one of them red. Checked by deleting each rule from src/access-token.ts.
describe("the boundary pairs that hold the rules", () => {
  const byName = new Map(file.cases.map((c) => [c.name, c]));
  for (const [rule, names] of [
    ["exp leeway", ["exp-leeway-29", "exp-leeway-31"]],
    ["iat leeway", ["iat-future-29", "iat-future-31"]],
    ["nbf leeway", ["nbf-future-29", "nbf-future-31"]],
    ["lifetime", ["lifetime-300", "lifetime-301"]],
    [
      "mayDispatch",
      ["mayDispatch-non-prn-value", "wildcard-mayDispatch-value"],
    ],
  ] as const)
    test(`${rule}: ${names.join(", ")}`, async () => {
      for (const name of names) {
        const v = byName.get(name);
        if (!v) throw new Error(`no ${name} vector`);
        expect(await outcome(v)).toEqual(v.expect);
      }
    });
});
