# Every crossing, phase 1: the work loop, decisions, approvals and Accounts

**Date:** 2026-11-22. Dated by the day it was written.
**Status:** Planned. Follows [phase 0](2026-11-22-every-crossing-plan.md), which must be released
(treaty `v0.0.15`) before any product step below can pin it.
**Inputs:** four read-only sweeps of every repository's `main` on 2026-11-22, covering
SuperPipeline's routes, Accounts' routes, the access-token verifiers, and every consumer call
site. Their findings are summarised here; file references are in the sweep notes kept with the
pull request.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** the agent work loop, every human decision written back, the approvals SuperToolkit asks
for, and the Accounts API all run on contracts in treaty, and every access token is verified by
the same rules.

**Architecture:**

- **Treaty side:** treaty gains five OpenAPI documents and signed token vectors.
- **Producers:** SuperPipeline and Accounts validate every response they serve in tests against
  those documents.
- **Consumers:** each consumer runs the documents' cases through its real client. In TypeScript
  that goes through the test fakes it already has; in Go through `treaty cases`.
- **One TypeScript verifier.** The TypeScript products verify tokens with one verifier, which
  moves from Accounts into `treaty-ecosystem-identity`. SuperWitness's Go verifier runs the same
  vectors.

## What the sweeps found

### SuperPipeline

- **Its zod contract package is not the wire contract.**
  - `packages/contract`'s verb schemas (`ClaimInput`, `CompleteInput`, `ClaimResult`…) are
    imported nowhere and have drifted from the routes.
  - The real request types are hand-written in the handlers.
  - Contracts are therefore written from the routes and checked against them, never generated
    from that package.
- **Errors come in six shapes:**
  - `{error:{ok,code,message,detail?}}`;
  - flat `{error:{…detail,ok,code,message}}`;
  - `{error:{code,message}}`;
  - `{error:{code}}`;
  - `{error:"text"}`;
  - `{error:{message}}`.

  Every consumer reads `error.code`. The AgentPod hub also accepts a string. Moving every route
  to `schemas/common/error.v1.json` breaks no consumer.

- **Defects to fix as the contract lands:**
  - Malformed JSON gives a 500 on gate resolve, elicitation answer, run verbs and approval-subject
    verify.
  - On a plain gate, an unknown `decision` value is treated as a **reject**.
  - The approval-subject verify and delivery routes return 403 for every refusal, including
    `INVALID_LIVE_URL`.
  - `GateView.status` leaves out `cancelled`, which the board writes.
  - The verify RPC type leaves out `expiresAt` and `gateStatus`, which the route returns and
    SuperToolkit relies on.

### Accounts

- **Errors** on its token, principal, identity and policy routes are a flat `{error:"snake_code"}`,
  sometimes with extra fields such as `scope` or `usableAt`. That is a third shape.
- **The device flow** is Better Auth's OAuth device grant, with OAuth errors. It is a standard, apart
  from Accounts' own `{device_credential}` success body.

### The verifiers

Seven implementations disagree:

| Behaviour                         | Divergence                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Clock leeway                      | 0 everywhere, except SuperWitness, which allows 30 s                         |
| Lifetime                          | only Accounts' reference refuses a token over 300 s                          |
| `jti`                             | SuperWitness does not require it                                             |
| `mayDispatch` and `mayGrantReach` | SuperLibrary and SuperWitness never check them                               |
| A non-prn value in `mayDispatch`  | SuperPipeline refuses the token, Accounts drops the value, AgentPod keeps it |
| `sub` and `org` grammar           | SuperWitness's is loose, and its own fixtures depend on that                 |

Treaty's `token_claims.json` names 15 rejection cases but holds no tokens. So nothing makes the
implementations agree.

### Consumers

There are 13 drift items. The ones that break today:

- **SuperToolkit's preview blocks** drop empty `value`/`text` fields (`omitempty`). The board's
  strict parser requires them, so such a request is refused with 400 `INVALID_APPROVAL_REQUEST`.
- **SuperWitness's canary** creates cards with a service token on a route that serves no service
  tokens (inferred from the code; to confirm from its run history).

The others are latent:

- `cancelled` gate status;
- SuperToolkit accepting a `gateStatus: "open"` the board never sends;
- the hub reading `options[].input` on questions, which never carry it;
- the hub discarding the claim refusal `reason`;
- `boardId` typed non-null where it can be null;
- stale comments in the hub and SuperExchange;
- test ids that real routing would not match (`crd_`, `gte_1`, `brd_fixture`).

Salaam does not call SuperPipeline. AgentPod relays to it, so Salaam is a consumer of the
hub's contract (phase 3), not of these.

## Rulings this phase applies

These are defaults. Each is a line in a contract, so changing one later is a versioned change,
not a rewrite.

1. **One error envelope for SuperPipeline:** `schemas/common/error.v1.json`. SuperPipeline moves
   every route to it in its own pull request, before its consumers move. Every code it can return
   is in `contracts/error-codes.json`, checked against `statusForCode` by its tests.
2. **Accounts keeps its flat envelope for v1.** It becomes `schemas/common/flat-error.v1.json`,
   and an HTTP contract names its envelope with `x-treaty-error-envelope`. Moving Accounts to
   `error.v1` changes a string into an object, which breaks its readers, so it is a `v2` of the
   API, not part of this phase.
3. **Token rules, the same in every verifier:**
   - **Leeway:** 30 s on `exp`, `nbf` and `iat`.
   - **Lifetime:** at most 300 s (`exp - iat`).
   - **Required claims:** `jti`, plus `mayDispatch` and `mayGrantReach`.
   - **Refused outright:** any `mayDispatch` value that is not a prn.
   - **Grammar:** `sub` and `org` follow the id grammar exactly.
   - **Keys:** a token with no `kid` is refused; only Ed25519 keys are used.
   - **Fetching keys:** a refetch on an unknown `kid` happens at most once per 30 s, with a 3 s
     timeout.
4. **Bad input is a 400, never a 500, and never a different action.**
   - Malformed JSON is 400 `INVALID_JSON`.
   - A decision outside a gate's options is 400 `GATE_DECISION_NOT_ALLOWED`, on every gate, plain
     ones included.

## Release order

1. **treaty `v0.0.15`** (phase 0), then **`v0.0.16`** (this phase's treaty task). Only the operator
   tags.
2. **SuperPipeline**, the producer: its error envelope, defect fixes and contract tests. It merges,
   deploys to staging, then gets a production tag.
3. **Accounts**, the producer: contract tests, and its reference verifier replaced by treaty's.
4. **Consumers, in any order:** AgentPod, SuperExchange, SuperToolkit, SuperLibrary, SuperWitness.
   Each is one PR, linked, with the merge order in its body.
5. **Proof on staging:** a card claimed, worked and completed by a station; a gate decided in
   chat; an approval asked by `stk` and answered; every product's `treaty verify` green.

---

## Task 1 (treaty): two error envelopes, every code registered

**Files:**

- Create `schemas/common/flat-error.v1.json` (`{ error: string matching ^[a-z][a-z0-9_]*$ }`,
  extra properties allowed) and `fixtures/common/flat-error.v1.cases.json`.
- Modify `contracts/error-codes.json`:
  - add every code SuperPipeline returns: its 100 `BoardErrorCode`s plus the route-level ones
    (`UNAUTHORIZED`, `FORBIDDEN`, `INVALID_JSON`, `INVALID_INPUT`, `INVALID_BODY`, `INVALID_WAIT_ID`,
    `INVALID_COMMENT`, `EVIDENCE_LINK_UNAVAILABLE`, `UNKNOWN_RUN_ACTION`, `BOARD_NOT_FOUND`,
    `METHOD_NOT_ALLOWED`, `CHECKPOINT_SETTLEMENT_TOO_LARGE`, `CHECKPOINT_SOURCE_TOO_LARGE`);
  - add Accounts' snake-case codes with their statuses, under owner `accounts`.
- Modify `schemas/treaty/error-codes.v1.json`: a code is SCREAMING_SNAKE for an `error.v1` API,
  snake_case for a `flat-error.v1` API, and records its `envelope`.
- Modify `packages/contracts/src/openapi-check.ts`:
  - a document declares `x-treaty-error-envelope` (default `error.v1`);
  - every 4xx and 5xx response must be that envelope;
  - every listed code must be the owner's in that envelope.
- Tests: `scripts/error-codes.test.ts` and `packages/contracts/test/openapi-check.test.ts` gain one
  case per new rule; the revert-proof is a document using the wrong envelope.

**Interfaces.** Produces `x-treaty-error-envelope: "error.v1" | "flat-error.v1"`, read by Tasks 2 to 5.

## Task 2 (treaty): `schemas/http/superpipeline/agent-work.v1.openapi.json`

**Operations:**

- `claimCard` (POST claims)
- `readRun` (GET runs/{runId})
- `readRunAttempts`
- one operation per run verb, each its own path:
  - `heartbeatRun`
  - `postRunActivity`
  - `completeRun`
  - `submitRun`
  - `blockRun`
  - `failRun`
  - `releaseRun`
  - `addRunReference`
- `addRunEvidenceReference`
- `verifyRunApprovalSubject`
- the checkpoint routes: `readRunCheckpointSource`, `admitRunCheckpointSource`,
  `submitCheckpointSettlement` and `readRunCheckpoint`. These reference the existing
  `schemas/superpipeline-api/*.v1.json` bodies, which makes `superpipeline.run-checkpoint` contracted.

**Components** are written from the handlers' real types:

- `ClaimResult` (the claimed and unclaimed union, with `ClaimReason`'s 11 values);
- `CardView`, `StageDef`, `RunContext`, `AttemptView`, `ReferenceView`;
- the activity request, with `StrictDecision` and `ApprovalDetail`;
- the complete request (`outcome`, `findings`, `question`, `url`, `options`).

**Rules:**

- Every operation lists its `x-treaty-error-codes`.
- Cases use realistic ids (`brd_` + 16 hex, `card_…`, `run_…`).
- Each request has at least one invalid case per refusal the handler makes.
- `superpipeline.agent-work` becomes `contracted`.

## Task 3 (treaty): `schemas/http/superpipeline/decisions.v1.openapi.json`

**Operations:**

- **Writes:**
  - `resolveGate`
  - `pullBackGate`
  - `setGateDelivery`
  - `answerElicitation` (including the `apr_` approval-request branch, as one operation with a
    `oneOf` response)
  - `resumeCard`
  - `archiveCard`
  - `overrideCardCheck`
- **Reads:**
  - `listPendingGates`
  - `listPendingElicitations`
  - `listPendingDeliveries`
  - `listPendingAttention`
  - `readGate`
  - `readCardChecks`

**Rules:**

- The pending list items `$ref` the existing `schemas/superpipeline/*.pending.v1.json` schemas, so
  a pushed body and a read body are one contract.
- `GateView.status` is `pending | resolved | cancelled`.
- Security schemes describe the person assertion (an org-plane token whose `act.sub` names the
  speaking service) and the service token with its scopes.
- `superpipeline.decisions` becomes `contracted`.

## Task 4 (treaty): `schemas/http/superpipeline/approvals.v1.openapi.json`

**Operations:**

- `createApprovalRequest` (201 new, 200 replay, 409 `REQUEST_ID_CONFLICT`)
- `readApprovalRequest`
- `verifyApprovalSubject` (with `expiresAt` and `gateStatus`)
- `recordApprovalDelivery`

**Rules:**

- The `stk-capability/v1` subject is strict, as the board parses it.
- Its invalid cases include a `field` block with no `value` and a `text` block with no `text`.
  Those are SuperToolkit's live drift.
- `superpipeline.approvals` becomes `contracted`.

## Task 5 (treaty): `schemas/http/accounts/plane.v1.openapi.json`

**Operations:**

- **Tokens:**
  - `exchangeServiceToken`
  - `exchangeAgentToken`
  - `exchangeAssertion`
  - `exchangeDeviceToken`
- **Principals:**
  - `createAgent`
  - `listPrincipals`
  - `readPrincipal`
  - `suspendPrincipal`
  - `unsuspendPrincipal`
  - `putGrant`
- **Identities:**
  - `putIdentity`
  - `listIdentities`
  - `findByIdentity`
- **Policy:** `decidePolicy`

**Rules:**

- The envelope is `flat-error.v1`.
- `identity_pending` carries `usableAt`.
- The device grant's endpoints stay `standard` (RFC 8628). Only its `{device_credential}` success
  body is described here.
- `accounts.plane-api` becomes `contracted`.

## Task 6 (treaty): signed token vectors and one verifier

**Files:**

- Create `fixtures/ecosystem-identity/token_vectors.json`:
  - a test Ed25519 key pair and its JWKS, marked test-only;
  - for each case: a signed token, the verifier's `now`, issuer, audience and product, and the
    expected result (the claims, or a refusal code).

  It covers every one of `token_claims.json`'s 15 rejection cases. It adds cases for:
  - leeway, at 29 s and 31 s;
  - lifetime at 300 s and 301 s;
  - a missing `kid`;
  - a non-prn `mayDispatch` value;
  - a loose `sub` and a loose `org`.

- Create `scripts/token-vectors.ts`, which regenerates the file deterministically from a seed,
  and `scripts/token-vectors.test.ts`.
- Modify `packages/ecosystem-identity`: add `verifyAccessToken(token, { jwks, issuer, audience,
product, now? }) → Claims` that throws `AccessTokenError(code)`. It is moved from Accounts'
  `consumer/verify.ts` and changed to the rulings above, and passes every vector. It depends on
  `jose`.
- `accounts.token-claims` becomes `contracted`.

**Interfaces.** Every verifier in every language takes `{ jwks, issuer, audience, now }` from a
vector and must produce its `expect`. That is the conformance test SuperWitness's Go verifier
runs.

---

## Product tasks

Each is one pull request in its repository. Each runs that repository's CI locally before it is
pushed, and is linked to the treaty release it pins.

### SuperPipeline (producer; merges first)

1. Every error body is `error.v1`: one helper, used by every route, and the four other shapes
   removed. A test asserts every code a route can return is in treaty's registry with the same
   status as `statusForCode`.
2. Malformed JSON is 400 `INVALID_JSON` on the four routes. An unknown gate decision is 400. The
   approval-subject routes use `statusForCode`. `GateView.status` includes `cancelled`, and the
   verify RPC type gains `expiresAt` and `gateStatus`.
3. **Contract tests.** A wrapper around `SELF.fetch` in `test/setup.ts`, like the existing push-body
   check, validates every request and response of a contracted route against treaty's documents,
   for every test that touches one. It fails on a route that matches no operation.
4. `treaty.json` and `treaty verify` in CI. Retire `packages/contract`'s unused verb schemas.

### Accounts (producer)

1. **Contract tests.** Every route's responses in its tests are validated against
   `plane.v1.openapi.json`.
2. `consumer/verify.ts` becomes a re-export of treaty's `verifyAccessToken`, and its tests run
   the vectors. The issuer's own tests assert that every minted token passes the vectors' rules.
3. `treaty.json` and `treaty verify` in CI.

### AgentPod hub

1. The hand-written SuperPipeline client keeps its interface:
   - its test fake validates every request it is sent against the contract;
   - every valid response case goes through the client's parsers;
   - the casts become checked reads.
2. Fix the drift:
   - keep the claim refusal `reason`;
   - `boardId` may be null;
   - drop the question `options[].input` read and the dead `FORBIDDEN` branch;
   - correct the stale comments.
3. The org-plane verifier is treaty's `verifyAccessToken`.
4. `treaty-matrix-events` moves from 0.0.10 to current.
5. `treaty.json` and `verify` in CI.

### SuperExchange

1. Its SuperPipeline client's fake validates requests against the contract, and its readers parse
   every response case.
2. The stale comment is corrected.
3. `treaty.json` and `verify` in CI.

### SuperToolkit (Go)

1. Vendor the approvals cases (`treaty sync`), and decode each one into `ApprovalCreated`,
   `ApprovalReadBack` and `GateConfirmation`. Marshal `Host.Request` for empty fields, and validate
   it against the request schema.
2. Fix the drift: empty preview values are sent as `"—"`, never omitted, and the `gateStatus ==
"open"` branch is removed.
3. `treaty.json` and `npx … treaty verify` in CI.

### SuperLibrary

1. Its org-plane verifier is treaty's `verifyAccessToken`, which adds the missing control-pair
   checks.
2. `treaty.json`.

### SuperWitness (Go)

1. Its verifier runs `token_vectors.json`:
   - it requires `jti` and the control pair;
   - its grammar is strict;
   - its own fixture ids are made real.
2. Confirm the canary's `POST cards` refusal from its run history. If it is refused, the canary
   asks for an agent token.
3. `treaty.json`.

## Review focus

1. **A pending list whose item validates as a pushed event but not as a read body.** The `$ref`
   to the event schema makes that impossible. SuperPipeline's wrapper proves it on every test
   that lists pending items.
2. **A strict-decision replay with the same `request_id`.** The contract's response is the stored
   one, so a case covers the replay.
3. **A person-assertion token used where a service token is expected, and the reverse.** Both are
   refused with `error.v1` `UNAUTHORIZED` or `FORBIDDEN`, never a plain string.
4. **A token 31 s past `exp`.** Every verifier refuses it; at 29 s every verifier accepts.
   SuperWitness's current 30 s leeway must land on the same side as the others.
5. **SuperToolkit asking with an empty requester.** Before the fix it is refused 400; after it, it
   is accepted. The case is in the approvals corpus.
