---
title: treaty-ecosystem-identity
description: "@superjackfruitlabs/treaty-ecosystem-identity: the identity fixture corpus every product checks its ids, token claims, prompts and chat events against."
---

[`@superjackfruitlabs/treaty-ecosystem-identity`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-ecosystem-identity)
is the identity contract as plain JSON. Each product still owns its own types; the shared corpus is
how we prove they agree. Use it in your tests whenever code mints or checks a suite id, verifies an
access token, renders a card prompt or joins runs.

```ts
import grammar from "@superjackfruitlabs/treaty-ecosystem-identity/id_grammar.json" with { type: "json" };
import { CORPUS_FILES } from "@superjackfruitlabs/treaty-ecosystem-identity";
```

You can now drive your validator from the grammar and use `CORPUS_FILES` to discover the rest of
the published contract without maintaining a second file list.

`CORPUS_FILES` lists every file, each published at its own subpath:

| File | What it pins |
| --- | --- |
| `id_grammar.json` | What each product mints and validates for every entity id, the full prefix registry, and the collisions in it, open and settled. |
| `token_claims.json` | The access-token claims every product verifies, in the organization plane's shape, with reject cases and one example token per kind of caller. |
| `card_prompt.json` | What a card becomes when it is handed to a harness. It pins the rendered text, not only the shape. |
| `run_join_key.json` | The run join key: SuperPipeline mints the work run, AgentPod executes it, and dispatched work has no competing run id. |
| `token_vectors.json` | Signed tokens with a test-only key and its JWKS, and what every verifier must answer for each: the claims, or one refusal code. The conformance test for every verifier, in any language. |
| `matrix_gate_events.json` | The chat events a gate, question, follow-up, waiting card or permission crosses Matrix on, with accept and reject cases. The [Matrix corpus](/fixtures/) is built from it. |

## Verifying an access token

`verifyAccessToken()` verifies an Accounts access token offline and returns its claims, or throws
`AccessTokenError` with a `code` from a closed set (`ACCESS_TOKEN_ERROR_CODES`). It takes the JWKS
as data, so it is pure and runs the same in Workers, Bun and Node:

```ts
import { createJwksCache, verifyAccessToken } from "@superjackfruitlabs/treaty-ecosystem-identity";

const keys = createJwksCache({ url: "https://accounts.superjackfruit.com/api/auth/jwks" });
const claims = await verifyAccessToken(token, {
  jwks: await keys.getKeys(kid),
  issuer: "https://accounts.superjackfruit.com",
  audience: "https://app.superpipeline.dev",
  product: "superpipeline",
});
```

The rules are the same in every verifier: EdDSA over Ed25519 only (other keys in the JWKS are
ignored), a `kid` required, `iss` exact, `aud` equal to or containing your audience, 30 s of
leeway on `exp`, `nbf` and `iat`, a lifetime (`exp - iat`) of at most 300 s, `jti`, `mayDispatch`
and `mayGrantReach` required, `sub` and `org` in the id grammar, any `mayDispatch` value that is
not a prn refusing the whole token, and `ent` containing your product (else
`product_not_enabled`, which you answer with a 403). Every claim comes back, the conditional ones
included. `token_vectors.json` holds a case for each rule; treaty's tests run them all.

`createJwksCache()` fetches the JWKS with a 3 s timeout, serves a stale set while it refreshes it,
refetches on an unknown `kid` at most once every 30 s, and keeps the last good set when the issuer
is down.

The corpus moved here from AgentPod on 2026-11-10, with its history. It depends on no type from any
product, so you can read it from any product. Every entity carries a `reject` list as well as valid
examples; see [Fixtures](/fixtures/#negative-cases-are-the-point).
