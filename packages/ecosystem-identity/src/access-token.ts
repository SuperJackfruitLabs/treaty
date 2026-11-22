/**
 * One access-token verifier for the suite, to the rules in token_claims.json and
 * token_vectors.json: EdDSA over Ed25519 only, a kid required, 30 s of leeway on exp, nbf and
 * iat, a lifetime of at most 300 s, and every required claim in its grammar. It is pure: it takes
 * the JWKS as data, so it runs the same in Workers, Bun and Node, and `now` makes it testable.
 */
import { compactVerify, decodeProtectedHeader, importJWK } from "jose";

/** The closed set of refusal codes, the same in every verifier (token_vectors.json). */
export const ACCESS_TOKEN_ERROR_CODES = [
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
] as const;

export type AccessTokenErrorCode = (typeof ACCESS_TOKEN_ERROR_CODES)[number];

/** Why a token was refused. `code` is one of ACCESS_TOKEN_ERROR_CODES. */
export class AccessTokenError extends Error {
  readonly code: AccessTokenErrorCode;
  constructor(code: AccessTokenErrorCode, message: string = code) {
    super(message);
    this.name = "AccessTokenError";
    this.code = code;
  }
}

export const PRINCIPAL_KINDS = ["human", "agent", "service"] as const;
export type PrincipalKind = (typeof PRINCIPAL_KINDS)[number];

/** A verified token's claims: the required ones typed, every other claim passed through. */
export interface AccessTokenClaims {
  readonly [claim: string]: unknown;
  iss: string;
  sub: string;
  aud: string | string[];
  iat: number;
  exp: number;
  nbf?: number;
  jti: string;
  principalKind: PrincipalKind;
  org: string;
  ent: string[];
  mayDispatch: string[];
  mayGrantReach: boolean;
  act?: { sub: string };
  email?: string;
  email_verified?: boolean;
  scope?: string;
  amr?: string[];
  orgRole?: string;
  client_id?: string;
  azp?: string;
  sid?: string;
}

export interface VerifyAccessTokenOptions {
  /** The issuer's JWKS. Only OKP Ed25519 keys are used; any other key is ignored. */
  jwks: { keys: unknown[] };
  /** The issuer's base URL, matched exactly. */
  issuer: string;
  /** This consumer's audience: aud must equal it or, as an array, contain it. */
  audience: string;
  /** This consumer's product, which ent must contain. */
  product: string;
  /** Unix seconds. Defaults to the clock. */
  now?: number;
}

export const LEEWAY_SECONDS = 30;
export const MAX_LIFETIME_SECONDS = 300;
const PRN = /^prn_[0-9a-f]{20}$/;
const ORG = /^org_[0-9a-f]{20}$/;
const KINDS: ReadonlySet<string> = new Set(PRINCIPAL_KINDS);

const refuse = (code: AccessTokenErrorCode, message?: string): never => {
  throw new AccessTokenError(code, message);
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** The Ed25519 key the JWKS holds under `kid`, or undefined. Keys of other kinds are skipped. */
function ed25519Key(
  jwks: { keys: unknown[] },
  kid: string,
): Record<string, unknown> | undefined {
  const keys: unknown[] = Array.isArray(jwks.keys) ? jwks.keys : [];
  return keys
    .filter(isRecord)
    .find(
      (k) =>
        k.kid === kid &&
        k.kty === "OKP" &&
        k.crv === "Ed25519" &&
        typeof k.x === "string" &&
        (k.alg === undefined || k.alg === "EdDSA" || k.alg === "Ed25519") &&
        (k.use === undefined || k.use === "sig"),
    );
}

async function verifiedPayload(
  token: string,
  jwks: { keys: unknown[] },
): Promise<Record<string, unknown>> {
  if (typeof token !== "string" || token.split(".").length !== 3)
    refuse("malformed", "not a compact JWS");
  let header: Record<string, unknown>;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    return refuse("malformed", "the header is not a JSON object");
  }
  if (header.alg !== "EdDSA") refuse("bad_algorithm", "only EdDSA is accepted");
  const kid = header.kid;
  if (typeof kid !== "string" || kid === "")
    return refuse("missing_kid", "the header has no kid");
  const jwk = ed25519Key(jwks, kid);
  if (!jwk) return refuse("unknown_key", `no Ed25519 key has kid ${kid}`);
  let bytes: Uint8Array;
  try {
    const key = await importJWK(
      { kty: "OKP", crv: "Ed25519", x: String(jwk.x) },
      "EdDSA",
    );
    ({ payload: bytes } = await compactVerify(token, key, {
      algorithms: ["EdDSA"],
    }));
  } catch {
    return refuse("bad_signature");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return refuse("malformed", "the payload is not JSON");
  }
  if (!isRecord(payload))
    return refuse("malformed", "the payload is not a JSON object");
  return payload;
}

function required<T>(
  p: Record<string, unknown>,
  claim: string,
  is: (v: unknown) => v is T,
  why = "has the wrong type",
): T {
  const v = p[claim];
  if (v === undefined) return refuse("missing_claim", `no ${claim}`);
  if (!is(v)) return refuse("bad_claim", `${claim} ${why}`);
  return v;
}

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const isPrn = (v: unknown): v is string => isString(v) && PRN.test(v);
const isOrg = (v: unknown): v is string => isString(v) && ORG.test(v);
const isKind = (v: unknown): v is PrincipalKind => isString(v) && KINDS.has(v);
const isAudience = (v: unknown): v is string | string[] =>
  isString(v) || isStrings(v);
const isPrns = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isPrn);
const isAct = (v: unknown): v is { sub: string } =>
  isRecord(v) && isString(v.sub);

/** The conditional claims a token may carry, and the type each must have when present. */
const CONDITIONAL: Record<string, (v: unknown) => boolean> = {
  act: isAct,
  email: isString,
  email_verified: isBoolean,
  scope: isString,
  amr: isStrings,
  orgRole: isString,
  client_id: isString,
  azp: isString,
  sid: isString,
};

/**
 * Verifies an access token and returns its claims, or throws AccessTokenError. Every refusal is
 * one of ACCESS_TOKEN_ERROR_CODES; fixtures/ecosystem-identity/token_vectors.json is the test.
 */
export async function verifyAccessToken(
  token: string,
  opts: VerifyAccessTokenOptions,
): Promise<AccessTokenClaims> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const p = await verifiedPayload(token, opts.jwks);

  const iss = required(p, "iss", isString);
  if (iss !== opts.issuer) refuse("wrong_issuer", `iss is ${iss}`);
  const aud = required(p, "aud", isAudience);
  if (Array.isArray(aud) ? !aud.includes(opts.audience) : aud !== opts.audience)
    refuse("wrong_audience");

  const exp = required(p, "exp", isNumber);
  const iat = required(p, "iat", isNumber);
  if (now >= exp + LEEWAY_SECONDS) refuse("expired");
  const nbf = p.nbf;
  if (nbf !== undefined && !isNumber(nbf)) refuse("bad_claim", "nbf");
  if (isNumber(nbf) && nbf > now + LEEWAY_SECONDS) refuse("not_yet_valid");
  if (iat > now + LEEWAY_SECONDS) refuse("issued_in_future");
  if (exp - iat > MAX_LIFETIME_SECONDS)
    refuse("lifetime_too_long", `lives ${exp - iat} s`);

  const claims: AccessTokenClaims = {
    ...p,
    iss,
    aud,
    exp,
    iat,
    jti: required(p, "jti", (v): v is string => isString(v) && v !== ""),
    sub: required(p, "sub", isPrn, "is not a prn_ id"),
    principalKind: required(p, "principalKind", isKind, "is not a known kind"),
    org: required(p, "org", isOrg, "is not an org_ id"),
    ent: required(p, "ent", isStrings),
    mayDispatch: required(
      p,
      "mayDispatch",
      isPrns,
      "holds a value that is not a prn_ id",
    ),
    mayGrantReach: required(p, "mayGrantReach", isBoolean),
  };
  for (const [claim, is] of Object.entries(CONDITIONAL))
    if (p[claim] !== undefined && !is(p[claim]))
      refuse("bad_claim", `${claim} has the wrong type`);
  if (!claims.ent.includes(opts.product))
    refuse("product_not_enabled", `ent does not contain ${opts.product}`);
  return claims;
}
