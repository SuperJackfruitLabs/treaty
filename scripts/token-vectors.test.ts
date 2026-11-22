import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VECTORS_PATH } from "./token-vectors.ts";

const CODES = new Set([
  "malformed",
  "bad_algorithm",
  "missing_kid",
  "unknown_key",
  "bad_signature",
  "wrong_issuer",
  "wrong_audience",
  "expired",
  "not_yet_valid",
  "issued_in_future",
  "lifetime_too_long",
  "missing_claim",
  "bad_claim",
  "product_not_enabled",
]);

const vectors: {
  corpus: string;
  version: number;
  warning: string;
  refusalCodes: Array<{ code: string; meaning: string }>;
  jwks: { keys: Array<Record<string, unknown>> };
  cases: Array<{
    name: string;
    why: string;
    token: string;
    verifier: Record<string, unknown>;
    expect: { ok: boolean; code?: string; claims?: unknown };
  }>;
} = JSON.parse(readFileSync(VECTORS_PATH, "utf8"));
const claims: {
  reject: Array<{ case: string }>;
  examples: Record<string, unknown>;
} = JSON.parse(
  readFileSync(
    join(import.meta.dir, "../fixtures/ecosystem-identity/token_claims.json"),
    "utf8",
  ),
);

test("token_vectors.json is what scripts/token-vectors.ts writes", () => {
  const r = spawnSync(
    "bun",
    [join(import.meta.dir, "token-vectors.ts"), "--check"],
    {
      encoding: "utf8",
    },
  );
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
});

test("says plainly that its keys are test keys", () => {
  expect(vectors.warning).toMatch(/TEST KEYS ONLY/);
  expect(vectors.warning).toMatch(/never trust/);
});

test("its refusal codes are the closed set, each explained once", () => {
  expect(new Set(vectors.refusalCodes.map((c) => c.code))).toEqual(CODES);
  expect(vectors.refusalCodes.length).toBe(CODES.size);
  for (const c of vectors.refusalCodes) expect(c.meaning).not.toBe("");
});

test("every case is named once, says why and has a well-formed expectation", () => {
  const names = vectors.cases.map((c) => c.name);
  expect(new Set(names).size).toBe(names.length);
  for (const c of vectors.cases) {
    expect(c.why).not.toBe("");
    expect(typeof c.token).toBe("string");
    for (const k of ["issuer", "audience", "product"])
      expect(typeof c.verifier[k]).toBe("string");
    expect(Number.isInteger(c.verifier.now)).toBe(true);
    if (c.expect.ok) expect(typeof c.expect.claims).toBe("object");
    else expect(CODES.has(c.expect.code ?? "")).toBe(true);
  }
});

test("covers every reject case and example in token_claims.json, and the rulings' edges", () => {
  const names = new Set(vectors.cases.map((c) => c.name));
  for (const r of claims.reject) expect(names.has(r.case)).toBe(true);
  for (const name of Object.keys(claims.examples))
    expect(names.has(`example-${name}`)).toBe(true);
  for (const name of [
    "exp-leeway-29",
    "exp-leeway-31",
    "iat-future-29",
    "iat-future-31",
    "nbf-future-29",
    "nbf-future-31",
    "lifetime-300",
    "lifetime-301",
    "missing-kid",
    "mayDispatch-non-prn-value",
    "mayGrantReach-absent",
    "sub-loose",
    "org-loose",
    "non-ed25519-key-ignored",
    "aud-array-contains-audience",
  ])
    expect(names.has(name)).toBe(true);
});

test("the JWKS holds one Ed25519 key and keys a verifier must ignore", () => {
  const ed = vectors.jwks.keys.filter(
    (k) => k.kty === "OKP" && k.crv === "Ed25519",
  );
  expect(ed.length).toBe(1);
  expect(vectors.jwks.keys.length).toBeGreaterThan(1);
  for (const k of vectors.jwks.keys) expect(k.d).toBeUndefined();
});
