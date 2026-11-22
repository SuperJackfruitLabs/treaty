/**
 * Writes fixtures/ecosystem-identity/token_vectors.json: signed access tokens and what every
 * verifier must answer for each. `bun scripts/token-vectors.ts` writes the file;
 * `bun scripts/token-vectors.ts --check` exits 1 when the committed file is not what it writes.
 *
 * Everything is fixed: the keys come from fixed seeds, the timestamps from the examples in
 * token_claims.json, and Ed25519 and HMAC signatures are deterministic, so the file is the same
 * byte for byte on every run. It signs with node:crypto directly rather than with the verifier's
 * library, so the two do not share a mistake.
 */
import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
  type KeyObject,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
export const VECTORS_PATH = join(
  ROOT,
  "fixtures/ecosystem-identity/token_vectors.json",
);
const CLAIMS_PATH = join(ROOT, "fixtures/ecosystem-identity/token_claims.json");

type Payload = Record<string, unknown>;
type Header = Record<string, unknown>;
interface Jwk {
  kty: string;
  crv: string;
  x: string;
  y?: string;
  d?: string;
  kid?: string;
  alg?: string;
  use?: string;
}

/**
 * A test issuer, never a production one: a token signed with the test key can then never name a
 * real issuer, even if the test key set were mistakenly configured somewhere.
 */
const ISSUER = "https://issuer.treaty.test";
const SP = "https://app.superpipeline.dev";
const HUB = "https://hub.agentpod.dev";
const KID = "test-ed25519-1";
const RETIRED_KID = "test-ed25519-retired";
const X25519_KID = "test-x25519";

export const REFUSAL_CODES: Array<{ code: string; meaning: string }> = [
  {
    code: "malformed",
    meaning:
      "Not a compact JWS of three base64url parts whose header and payload are JSON objects.",
  },
  {
    code: "bad_algorithm",
    meaning:
      "The header's alg is not EdDSA (none, HS256 and every other value). The algorithm is pinned, never read from the header.",
  },
  { code: "missing_kid", meaning: "The header has no kid, or an empty one." },
  {
    code: "unknown_key",
    meaning:
      "No Ed25519 key in the JWKS has the header's kid. Keys of any other type or curve are ignored, as if absent.",
  },
  {
    code: "bad_signature",
    meaning: "The signature does not verify with the key the kid names.",
  },
  {
    code: "wrong_issuer",
    meaning: "iss is not exactly the verifier's issuer.",
  },
  {
    code: "wrong_audience",
    meaning:
      "aud neither equals the verifier's audience nor, as an array, contains it.",
  },
  {
    code: "expired",
    meaning: "now ≥ exp + 30: past expiry by the leeway or more.",
  },
  {
    code: "not_yet_valid",
    meaning: "nbf is present and nbf > now + 30.",
  },
  {
    code: "issued_in_future",
    meaning: "iat > now + 30.",
  },
  {
    code: "lifetime_too_long",
    meaning: "exp - iat > 300.",
  },
  {
    code: "missing_claim",
    meaning:
      "A required claim is absent: iss, aud, exp, iat, jti, sub, principalKind, org, ent, mayDispatch or mayGrantReach.",
  },
  {
    code: "bad_claim",
    meaning:
      "A claim is present with the wrong type or grammar: sub or org outside the id grammar, principalKind outside its enum, ent or mayDispatch not a string array, any mayDispatch value that is not a prn_ id (the whole token is refused), mayGrantReach not a boolean, or a conditional claim of the wrong type.",
  },
  {
    code: "product_not_enabled",
    meaning:
      "ent does not contain the verifier's product. The consumer answers 403 { error: 'product_not_enabled', org }.",
  },
];

// ---- keys ---------------------------------------------------------------------------------------

const seedOf = (label: string) =>
  createHash("sha256").update(`treaty token vectors: ${label}`).digest();

function ed25519(label: string): { key: KeyObject; jwk: Jwk; seed: string } {
  const seed = seedOf(label);
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
  return { key, jwk: jwkOf(key), seed: seed.toString("hex") };
}

function jwkOf(key: KeyObject): Jwk {
  const j = key.export({ format: "jwk" });
  const out: Jwk = {
    kty: String(j.kty),
    crv: String(j.crv),
    x: String(j.x),
  };
  if (j.y !== undefined) out.y = j.y;
  if (j.d !== undefined) out.d = j.d;
  return out;
}

const testKey = ed25519("test key 1");
const retiredKey = ed25519("retired test key");

const p256Public = jwkOf(
  createPublicKey(
    createPrivateKey({
      key: Buffer.concat([
        Buffer.from("30310201010420", "hex"),
        seedOf("p-256 key"),
        Buffer.from("a00a06082a8648ce3d030107", "hex"),
      ]),
      format: "der",
      type: "sec1",
    }),
  ),
);
const x25519Public = jwkOf(
  createPublicKey(
    createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b656e04220420", "hex"),
        seedOf("x25519 key"),
      ]),
      format: "der",
      type: "pkcs8",
    }),
  ),
);

const publicJwk = (k: Jwk, kid: string, alg?: string): Jwk => {
  const out: Jwk = { kty: k.kty, crv: k.crv, x: k.x };
  if (k.y !== undefined) out.y = k.y;
  out.kid = kid;
  if (alg) out.alg = alg;
  out.use = "sig";
  return out;
};

/**
 * The verifier's JWKS. The P-256 key comes first and shares the test key's kid, so a verifier
 * that takes the first key with a matching kid, of whatever type, fails every valid case.
 */
const JWKS = {
  keys: [
    publicJwk(p256Public, KID, "ES256"),
    publicJwk(testKey.jwk, KID, "EdDSA"),
    publicJwk(x25519Public, X25519_KID),
  ],
};

// ---- signing ------------------------------------------------------------------------------------

const b64 = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");

function jws(
  header: Header,
  payload: Payload,
  key: KeyObject = testKey.key,
): string {
  const input = `${b64(header)}.${b64(payload)}`;
  return `${input}.${sign(null, Buffer.from(input), key).toString("base64url")}`;
}

const signed = (payload: Payload, key: KeyObject = testKey.key) =>
  jws({ alg: "EdDSA", kid: KID }, payload, key);

// ---- cases --------------------------------------------------------------------------------------

interface Verifier {
  issuer: string;
  audience: string;
  product: string;
  now: number;
}
type Expect = { ok: true; claims: Payload } | { ok: false; code: string };
interface Case {
  name: string;
  why: string;
  token: string;
  verifier: Verifier;
  expect: Expect;
}

function readClaims(): {
  examples: Record<string, Payload>;
  reject: Array<{ case: string }>;
} {
  const parsed: unknown = JSON.parse(readFileSync(CLAIMS_PATH, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("examples" in parsed) ||
    !("reject" in parsed)
  )
    throw new Error("token_claims.json has no examples or reject list");
  const { examples, reject } = parsed;
  const out: Record<string, Payload> = {};
  if (typeof examples !== "object" || examples === null)
    throw new Error("token_claims.json: examples is not an object");
  for (const [name, ex] of Object.entries(examples)) {
    if (typeof ex !== "object" || ex === null)
      throw new Error(`token_claims.json: example ${name} is not an object`);
    // The examples name the production issuer; every vector is signed by the test issuer.
    out[name] = { ...ex, iss: ISSUER };
  }
  if (!Array.isArray(reject))
    throw new Error("token_claims.json: reject is not a list");
  return {
    examples: out,
    reject: reject.map((r: unknown) => ({
      case:
        typeof r === "object" && r !== null && "case" in r
          ? String(r.case)
          : "",
    })),
  };
}

const num = (p: Payload, k: string): number => {
  const v = p[k];
  if (typeof v !== "number") throw new Error(`${k} is not a number`);
  return v;
};

/** Where each example is verified: the audience it carries and the product it is for. */
const EXAMPLE_VERIFIERS: Record<string, { audience: string; product: string }> =
  {
    "oauth-human": { audience: SP, product: "superpipeline" },
    "device-human": { audience: HUB, product: "agentpod" },
    service: { audience: SP, product: "superpipeline" },
    agent: { audience: HUB, product: "agentpod" },
    "assertion-human": { audience: SP, product: "superpipeline" },
  };

export function buildCases(): Case[] {
  const { examples, reject } = readClaims();
  const cases: Case[] = [];
  const base = examples.service;
  if (!base) throw new Error("token_claims.json has no service example");
  const T = num(base, "iat");
  const at = (now: number): Verifier => ({
    issuer: ISSUER,
    audience: SP,
    product: "superpipeline",
    now,
  });
  const ok = (
    name: string,
    why: string,
    payload: Payload,
    now = T + 60,
    token = signed(payload),
  ) =>
    cases.push({
      name,
      why,
      token,
      verifier: at(now),
      expect: { ok: true, claims: payload },
    });
  const refuse = (
    name: string,
    why: string,
    code: string,
    token: string,
    now = T + 60,
  ) =>
    cases.push({
      name,
      why,
      token,
      verifier: at(now),
      expect: { ok: false, code },
    });
  const without = (claim: string, from: Payload = base): Payload =>
    Object.fromEntries(Object.entries(from).filter(([k]) => k !== claim));

  // Every example in token_claims.json verifies, and gives back exactly its claims.
  for (const [name, ex] of Object.entries(examples)) {
    const where = EXAMPLE_VERIFIERS[name];
    if (!where) throw new Error(`no verifier settings for the ${name} example`);
    cases.push({
      name: `example-${name}`,
      why: `token_claims.json's ${name} example, signed: it verifies and every claim comes back unchanged, the conditional ones included.`,
      token: signed(ex),
      verifier: { issuer: ISSUER, ...where, now: num(ex, "iat") + 60 },
      expect: { ok: true, claims: ex },
    });
  }

  // token_claims.json's reject cases, by the same names.
  const named: Record<string, () => void> = {
    "alg-none": () =>
      refuse(
        "alg-none",
        "Header alg none and an empty signature.",
        "bad_algorithm",
        `${b64({ alg: "none", kid: KID })}.${b64(base)}.`,
      ),
    expired: () =>
      refuse(
        "expired",
        "now is an hour past exp.",
        "expired",
        signed(base),
        num(base, "exp") + 3600,
      ),
    "wrong-issuer": () =>
      refuse(
        "wrong-issuer",
        "Validly signed, iss is another issuer.",
        "wrong_issuer",
        signed({ ...base, iss: "https://issuer.example.test" }),
      ),
    "wrong-audience": () =>
      refuse(
        "wrong-audience",
        "Validly signed for AgentPod's hub, presented to SuperPipeline.",
        "wrong_audience",
        signed({ ...base, aud: HUB }),
      ),
    "unknown-kid": () =>
      refuse(
        "unknown-kid",
        "Signed by a retired key whose kid is no longer in the JWKS.",
        "unknown_key",
        jws({ alg: "EdDSA", kid: RETIRED_KID }, base, retiredKey.key),
      ),
    "missing-org": () =>
      refuse(
        "missing-org",
        "No org claim.",
        "missing_claim",
        signed(without("org")),
      ),
    "product-not-enabled": () =>
      refuse(
        "product-not-enabled",
        "ent is [agentpod]; the verifier is SuperPipeline.",
        "product_not_enabled",
        signed({ ...base, ent: ["agentpod"] }),
      ),
    "mayDispatch-absent": () =>
      refuse(
        "mayDispatch-absent",
        "No mayDispatch claim: an issuer that predates the control pair.",
        "missing_claim",
        signed(without("mayDispatch")),
      ),
    "wildcard-mayDispatch-value": () =>
      refuse(
        "wildcard-mayDispatch-value",
        "mayDispatch holds * and prn_*. A pattern is not a prn, so the whole token is refused.",
        "bad_claim",
        signed({ ...base, mayDispatch: ["*", "prn_*"] }),
      ),
    "alg-not-eddsa": () =>
      refuse(
        "alg-not-eddsa",
        "HS256, keyed with the test key's public bytes: the classic algorithm-confusion token.",
        "bad_algorithm",
        (() => {
          const input = `${b64({ alg: "HS256", kid: KID })}.${b64(base)}`;
          const mac = createHmac(
            "sha256",
            Buffer.from(testKey.jwk.x, "base64url"),
          )
            .update(input)
            .digest("base64url");
          return `${input}.${mac}`;
        })(),
      ),
    "issuer-with-path": () =>
      refuse(
        "issuer-with-path",
        "iss is the issuer with a path after it; iss must be exact.",
        "wrong_issuer",
        signed({ ...base, iss: `${ISSUER}/api/auth` }),
      ),
    "missing-ent": () =>
      refuse(
        "missing-ent",
        "No ent claim.",
        "missing_claim",
        signed(without("ent")),
      ),
    "missing-jti": () =>
      refuse(
        "missing-jti",
        "No jti claim.",
        "missing_claim",
        signed(without("jti")),
      ),
    "unknown-principalKind": () =>
      refuse(
        "unknown-principalKind",
        "principalKind is robot.",
        "bad_claim",
        signed({ ...base, principalKind: "robot" }),
      ),
    "lifetime-over-300": () =>
      refuse(
        "lifetime-over-300",
        "exp - iat is 3600.",
        "lifetime_too_long",
        signed({ ...base, exp: T + 3600 }),
      ),
  };
  for (const r of reject) {
    const make = named[r.case];
    if (!make)
      throw new Error(
        `token_claims.json's reject case ${r.case} has no vector`,
      );
    make();
  }

  // Leeway: 30 s on exp, iat and nbf.
  const exp = num(base, "exp");
  ok("exp-leeway-29", "now = exp + 29: inside the leeway.", base, exp + 29);
  refuse(
    "exp-leeway-31",
    "now = exp + 31: past the leeway.",
    "expired",
    signed(base),
    exp + 31,
  );
  ok("iat-future-29", "iat is 29 s after now.", base, T - 29);
  refuse(
    "iat-future-31",
    "iat is 31 s after now.",
    "issued_in_future",
    signed(base),
    T - 31,
  );
  const withNbf = { ...base, nbf: T + 60 };
  ok("nbf-future-29", "nbf is 29 s after now.", withNbf, T + 31);
  refuse(
    "nbf-future-31",
    "nbf is 31 s after now.",
    "not_yet_valid",
    signed(withNbf),
    T + 29,
  );

  // Lifetime: exp - iat at most 300.
  ok("lifetime-300", "exp - iat is exactly 300.", { ...base, exp: T + 300 });
  refuse(
    "lifetime-301",
    "exp - iat is 301.",
    "lifetime_too_long",
    signed({ ...base, exp: T + 301 }),
  );

  // Keys and signatures.
  refuse(
    "missing-kid",
    "Signed with the test key, but the header names no kid.",
    "missing_kid",
    jws({ alg: "EdDSA" }, base),
  );
  ok(
    "non-ed25519-key-ignored",
    "The JWKS lists a P-256 key under the same kid, first. It is not Ed25519, so it is ignored and the Ed25519 key verifies the token.",
    base,
  );
  refuse(
    "kid-names-only-non-ed25519-key",
    "The kid names the JWKS's X25519 key, which is not an Ed25519 key, so no usable key has that kid.",
    "unknown_key",
    jws({ alg: "EdDSA", kid: X25519_KID }, base),
  );
  refuse(
    "signed-by-another-key",
    "The kid names the test key; the signature is the retired key's.",
    "bad_signature",
    signed(base, retiredKey.key),
  );
  const good = signed(base);
  const dot = good.lastIndexOf(".");
  const sig = good.slice(dot + 1);
  refuse(
    "tampered-signature",
    "The first character of the signature changed.",
    "bad_signature",
    `${good.slice(0, dot + 1)}${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`,
  );
  refuse("not-a-jws", "One part, not three.", "malformed", "not-a-token");

  // Audience.
  ok(
    "aud-array-contains-audience",
    "aud is an array that contains the verifier's audience.",
    { ...base, aud: [HUB, SP] },
  );

  // Claims.
  refuse(
    "mayDispatch-non-prn-value",
    "mayDispatch holds a prn and a namespaced pattern. Any value that is not a prn refuses the whole token, the valid prn beside it included.",
    "bad_claim",
    signed({
      ...base,
      mayDispatch: ["prn_aaaaaaaaaaaaaaaaaaaa", "agentpod:*/hermes"],
    }),
  );
  refuse(
    "mayGrantReach-absent",
    "No mayGrantReach claim: half of the control pair is missing.",
    "missing_claim",
    signed(without("mayGrantReach")),
  );
  refuse(
    "mayGrantReach-not-boolean",
    'mayGrantReach is the string "false".',
    "bad_claim",
    signed({ ...base, mayGrantReach: "false" }),
  );
  refuse(
    "sub-loose",
    "sub is prn_ followed by 20 characters that are not all lowercase hex.",
    "bad_claim",
    signed({ ...base, sub: "prn_0123456789abcdefghij" }),
  );
  refuse(
    "org-loose",
    "org is org_ followed by 20 characters that are not all lowercase hex.",
    "bad_claim",
    signed({ ...base, org: "org_0123456789abcdefghij" }),
  );
  refuse(
    "missing-iat",
    "No iat claim, so the lifetime cannot be checked.",
    "missing_claim",
    signed(without("iat")),
  );
  ok(
    "unknown-ent-value-ignored",
    "ent holds a product the verifier does not know beside its own; the unknown value is ignored.",
    { ...base, ent: ["superpipeline", "futureproduct"] },
  );
  refuse(
    "conditional-claim-wrong-type",
    'email_verified, a conditional claim, is the string "true". A conditional claim may be absent, never of the wrong type.',
    "bad_claim",
    signed({ ...base, email: "a@example.test", email_verified: "true" }),
  );

  return cases;
}

export function buildVectors() {
  return {
    corpus: "ecosystem-identity/token-vectors",
    version: 1,
    generatedBy:
      "scripts/token-vectors.ts. Do not edit by hand: change the script and run it.",
    purpose:
      "Signed access tokens and what every verifier must answer for each, in every language. A verifier takes `jwks` below and a case's `verifier` options, verifies the case's `token`, and must produce the case's `expect`: the claims exactly, or a refusal with exactly that code. This is the conformance test for verifyAccessToken in @superjackfruitlabs/treaty-ecosystem-identity and for every other verifier.",
    warning:
      "TEST KEYS ONLY. The keys in jwks sign nothing real, and their issuer is a .test name. A verifier must never trust these keys. The private keys are not published: scripts/token-vectors.ts derives them from fixed seeds to regenerate this file.",
    rules: {
      algorithm: "EdDSA",
      curve: "Ed25519",
      leewaySeconds: 30,
      maxLifetimeSeconds: 300,
      kidRequired: true,
      issuer: "exact match",
      audience: "equals, or (as an array) contains, the verifier's audience",
      grammar: {
        sub: "^prn_[0-9a-f]{20}$",
        org: "^org_[0-9a-f]{20}$",
        mayDispatch: "^prn_[0-9a-f]{20}$ for every value",
      },
      source:
        "docs/2026-11-22-every-crossing-phase-1.md, ruling 3; claims in token_claims.json",
    },
    howToRead: {
      refusalCodes:
        "The closed set of codes a verifier may refuse with. Every case has exactly one fault, so the answer does not depend on the order a verifier checks in.",
      jwks: "What the verifier is given. Only OKP Ed25519 keys are used; any other key is ignored as if absent, whatever its kid.",
      cases:
        "verifier.now is unix seconds. expect.claims is the token's whole payload: a verifier gives back every claim, the conditional and unknown ones included.",
    },
    refusalCodes: REFUSAL_CODES,
    testKey: {
      kid: KID,
      note: "The key that signs every valid case; its public half is in jwks.",
    },
    otherKeys: {
      retired: {
        kid: RETIRED_KID,
        note: "Not in jwks: it signs unknown-kid and signed-by-another-key.",
      },
      ignored:
        "jwks also lists a P-256 key under the test key's kid, and an X25519 key. Neither is Ed25519; a verifier ignores both.",
    },
    jwks: JWKS,
    cases: buildCases(),
  };
}

export const render = () => `${JSON.stringify(buildVectors(), null, 2)}\n`;

if (import.meta.main) {
  const want = render();
  if (process.argv.includes("--check")) {
    if (readFileSync(VECTORS_PATH, "utf8") !== want) {
      console.error(
        "token_vectors.json is stale: run bun scripts/token-vectors.ts",
      );
      process.exit(1);
    }
    console.log("token_vectors.json is current");
  } else {
    writeFileSync(VECTORS_PATH, want);
    console.log(`wrote ${VECTORS_PATH}`);
  }
}
