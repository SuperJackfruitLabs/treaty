# Every crossing under contract: the plan

**Date:** 2026-11-22. Dated by the day it was written.
**Status:** Direction set by the operator in conversation on 2026-11-22: implement treaty across
every product, as completely as it can be done. Phase 0 starts now. The rule it rests on is a
charter decision, proposed in the same change set
(`charter/decisions/2026-11-22-every-crossing-has-a-treaty-contract.md`).
**Follows:** [the treaty plan](2026-11-02-treaty-plan.md), whose seven steps are done.

## Why

On 2026-11-22 every product's `main` was read for the places it talks to another product. The
sweep found 137 crossing ends (each crossing counted once from each side):

| Class                                                     | Ends | Share |
| --------------------------------------------------------- | ---- | ----- |
| Typed or validated through an imported treaty package     | 13   | 9%    |
| Checked against a copied treaty schema or fixture         | 25   | 18%   |
| Hand-written on each side, each side its own reading      | 94   | 69%   |
| Untyped (raw JSON passed through, URLs built from string) | 5    | 4%    |

What treaty covers is the asynchronous half of the suite: the relay, the board-room Matrix
events, SuperBench's local API and the identity claims. What it does not cover is nearly every
synchronous HTTP call. That includes the work loop (claims, heartbeat, complete), every human
decision written back to SuperPipeline, the whole Accounts API and every call into SuperWitness
and SuperLibrary.

Drift is already live:

- SuperDispatch calls `GET /v1/agents/load`, which SuperPipeline does not serve. It gets a 404 and
  quietly falls back.
- SuperLibrary hand-copies the record event names that `schemas/superpipeline/record.v1.json`
  already defines.
- SuperDispatch hand-parses `card.ready` and ignores its schema.
- SuperPipeline signs its direct pushes with its own header beside the relay's, so one event has
  two delivery contracts.
- Four products verify Accounts tokens with four implementations.

## What "done" means

1. Every crossing between products is listed in `contracts/registry.json`, with an owner, its
   consumers, its kind and a status. Nothing crosses that is not listed.
2. Every crossing that is not a plain standard (OAuth, Matrix client-server, MCP transport,
   OTLP) has its contract in treaty as data: JSON Schema for bodies, OpenAPI 3.1 for HTTP APIs,
   and a corpus of valid and invalid cases for each.
3. Every product declares what it produces and consumes in a `treaty.json`, and its CI proves
   that:
   - its vendored copies match the pinned release;
   - its pin is recent;
   - as a producer, what it emits validates;
   - as a consumer, treaty's cases pass through its real parser.
4. Treaty's CI refuses a change that would break a reader or a writer within a version.
5. Coverage is measured from the registry and the manifests, and published. The target is 100%
   of the crossings that are not standards.
6. Duplicates are gone:
   - one push path (the relay);
   - one identity-token verifier per language;
   - no hand mirror of another product's client;
   - no file copied between two products outside treaty.

## Principles

These are treaty's existing rules, extended to everything:

- **Contracts are data.** Go, Rust, Swift and Python never import TypeScript. Every contract is
  schemas plus cases, and every language checks against the same files.
- **The owner authors and treaty holds.** The producing product writes and approves its
  contract, but the file lives here, so no product is the authority over what its siblings read.
  A product that publishes a public schema (SuperWitness's run report) publishes treaty's copy.
- **Within a version, only optional additions.** Readers ignore properties they do not know.
  Anything else is a new version published beside the old one. The old one is removed only after
  every consumer has moved, in a separate change.
- **The producer moves first.** Consumers follow, one pull request per repository, linked.
- **Products still stand alone.** Treaty is a public MIT library. Depending on a contract never
  means depending on a sibling being present.
- **Every guard has a test that fails when the guard is reverted.**

## Phases

| Phase                     | Delivers                                                                                                                                                                                                                                                                  | Exit criterion                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Foundations**        | The charter rule; the crossing registry seeded with today's inventory; HTTP contracts (OpenAPI 3.1 + cases); the shared error envelope and code registry; the compatibility check; `@superjackfruitlabs/treaty-contracts` (data, validators, `treaty` CLI)                | Treaty CI runs the registry, OpenAPI and compatibility checks; `treaty verify` passes on a sample product; coverage is computed from the registry |
| **1. Work and decisions** | SuperPipeline's agent work API, decision write-back, pending reads and approvals as OpenAPI; SuperPipeline validates its responses in tests; AgentPod, SuperExchange, Salaam and SuperToolkit consume them; the Accounts API and one token verifier for TypeScript and Go | The work loop and every approval run on contracted clients on staging; four verifiers become one per language                                     |
| **2. Events**             | `work.available`, `cards.stale` and push configs contracted; the direct push moves onto the relay; SuperDispatch and SuperLibrary read the existing schemas; AgentPod's own Matrix events and Live Activity contracted; SuperMessage's Rust core reads the bundle         | One delivery path and one signature; `X-Superpipeline-Signature` removed in a separate change                                                     |
| **3. The rest**           | Evidence and execution export, run reports and verdicts (moved into treaty); SuperLibrary's API; capability catalog and roster; placement, which fixes the `agents/load` 404; AgentPod ↔ Salaam; SuperToolkit's managed protocols; SuperBench's remaining operations     | Every registry entry is `contracted` or `standard`                                                                                                |
| **4. Enforce**            | Validation at the boundary in production, refusing writes and logging high-frequency reads; `treaty verify` required in every product's CI; scheduled coverage report on the docs site; copied files retired                                                              | Coverage reads 100% and a deliberate drift on staging is caught before merge                                                                      |

Each phase after 0 gets its own task-level plan in `docs/`, written when it starts, because its
details depend on what the phase before it produced. Phase 0's tasks are below.

### Release points

Consumers can only move after treaty publishes, and only the operator pushes `v*` tags:

| After                         | Release needed                                                     | Bootstrap                                                                                               |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Phase 0 merges                | treaty `v0.0.15`, the first `@superjackfruitlabs/treaty-contracts` | The new package is published once by hand and trusted on npmjs.com (top of `deploy/release/publish.sh`) |
| Each phase's treaty PR merges | the next treaty patch tag                                          | None                                                                                                    |
| Each producer's PR merges     | that product's own tag, before its consumers' tags                 | None                                                                                                    |

---

# Phase 0 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treaty can hold, check and ship a contract for any crossing, and can say which crossings
have none.

**Architecture:** Plain data under `contracts/`, `schemas/` and `fixtures/`, checked by Bun tests
in `scripts/`. One new package, `packages/contracts`, ships the data with a validator API and a
`treaty` CLI, so any repository can verify itself with one install.

**Tech Stack:** Bun, TypeScript, `@cfworker/json-schema` (already a dev dependency, becomes a
runtime dependency of the new package), JSON Schema 2020-12, OpenAPI 3.1 in JSON.

**Spec:** this document, sections above.

## Global Constraints

- All new files are JSON or TypeScript; no YAML contracts.
- JSON Schema draft 2020-12. A schema's `$id` is `https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/<path>`.
- OpenAPI documents start `"openapi": "3.1.0"` and live at `schemas/http/<owner>/<api>.v<N>.openapi.json`.
- Products are exactly: `accounts`, `agentpod`, `salaam`, `superbench`, `superdispatch`, `superexchange`, `superlibrary`, `supermessage`, `superpipeline`, `supertoolkit`, `superwitness`, `treaty`.
- `package.json` versions stay `0.0.0`; the tag sets the version.
- No code file over 1,000 lines; packages import nothing outside themselves; the lint baseline may not rise.
- Shipped code and docs never name local agents, hosts or teams.
- `bun run check` passes after every task.

## Review Focus

1. A schema edited in place by changing a property's `type` from `string` to `["string","null"]`.
   Readers expecting a string break, so the compatibility check must call it breaking (Task 4).
2. An OpenAPI path template with two parameters (`/v1/boards/{boardId}/cards/{cardId}`) next to a
   literal sibling (`/v1/boards/{boardId}/cards/ready`). `matchRoute` must prefer the literal
   (Task 3).
3. A product manifest that lists itself as a consumer of its own contract, or lists an id the
   registry lacks. `treaty verify` must name the id (Task 6).
4. A vendored copy that differs only in line endings or a trailing newline. It is not
   byte-identical and must fail, with a message that says to run `treaty sync` (Task 6).
5. A `$ref` from an OpenAPI document into a shared schema such as `schemas/common/error.v1.json`.
   The validator must resolve it from the bundle without the network (Task 3).

---

### Task 1: The crossing registry

**Files:**

- Create: `schemas/treaty/registry.v1.json`: schema of the registry.
- Create: `contracts/registry.json`: every crossing found on 2026-11-22.
- Create: `contracts/README.md`.
- Test: `scripts/registry.test.ts`.

**Interfaces:**

- Produces: registry entries `{ id, title, owner, consumers[], kind, status, contract[], cases?, gaps?, phase?, evidence[] }`.
  - `kind` is one of `http | event | matrix | ipc | cli | file | token | mcp | telemetry`.
  - `status` is one of `contracted | partial | uncontracted | proposed | external | standard | deprecated`.
  - `id` matches `^[a-z]+(\.[a-z0-9-]+)+$` and starts with the owner.
  - `contract` holds repository paths; at least one is required unless the status is `uncontracted`, `standard` or `deprecated`.
  - `gaps` and `phase` (1–4) are required for `partial`, `uncontracted` and `external`.
- Produces: `coverage(registry) → { applicable, contracted, partial, uncontracted, percent }`, in `packages/contracts/src/registry.ts` (Task 5 moves it into the package; write it there now).
  - `applicable` excludes `standard` and `deprecated`.
  - `percent` is `round(100 * contracted / applicable)`.

- [ ] **Step 1: Write the failing tests** in `scripts/registry.test.ts`:
  - `registry validates against its schema`;
  - `ids are unique`;
  - `every contract path exists`;
  - `every schema file under schemas/ (except schemas/treaty/) is named by at least one entry`;
  - `every catalog.json event's dataschema file is named by an entry of kind event`;
  - `an owner is never among its own consumers`;
  - `coverage of the seed registry is recorded` (expects the exact numbers of the seed, so any
    change to coverage is a visible diff).
- [ ] **Step 2: Run** `bun test scripts/registry.test.ts`. Expected: FAIL, as no registry exists yet.
- [ ] **Step 3: Write the schema and seed the registry** from the inventory in this plan's appendix. One entry per row, with statuses as written there.
- [ ] **Step 4: Run** `bun test scripts/registry.test.ts`, then `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `contracts: a registry of every crossing between products`.

### Task 2: The shared error envelope and error codes

**Files:**

- Create: `schemas/common/error.v1.json`. It describes `{ "error": { "code": string, "message": string, "detail"?: object } }`, SuperPipeline's shape today (`apps/api/src/card-reservation.ts:16`), and allows extra properties.
- Create: `contracts/error-codes.json` (`{ "codes": [{ code, owner, status, meaning }] }`) and its schema `schemas/treaty/error-codes.v1.json`.
- Create: `fixtures/common/error.v1.cases.json`.
- Test: `scripts/error-codes.test.ts`.

**Interfaces:**

- Produces: `schemas/common/error.v1.json#`, which OpenAPI documents reference for every 4xx and 5xx response.
- Produces: OpenAPI operations name their codes in `x-treaty-error-codes: string[]`. Every name must exist in `contracts/error-codes.json` with the operation's owner, which Task 3's meta-check enforces.

- [ ] **Step 1: Write the failing tests:**
  - `error.v1 accepts every valid case and refuses every invalid case`;
  - `codes are unique, SCREAMING_SNAKE_CASE, and owned by a known product`;
  - `status is an HTTP status from 400 to 599`.
- [ ] **Step 2: Run** `bun test scripts/error-codes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the schema, the cases and the code registry.** Seed the registry with four of SuperPipeline's codes, with the statuses its `statusForCode` (`apps/api/src/routes/errors.ts`) gives them on `main`: `NOT_RUN_OWNER` (403), `SEPARATION_OF_DUTIES` (403), `STALE_LEASE` (409) and `INVALID_STALE_SETTINGS` (400). Phase 1 adds all 105, checked against that function by SuperPipeline's own test.
- [ ] **Step 4: Run** the test and `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `contracts: one error envelope and a registry of error codes`.

### Task 3: HTTP contracts

**Files:**

- Create: `packages/contracts/src/schemas.ts`: `loadBundle(root) → Bundle`, which registers every schema by `$id`; `validatorFor(bundle, schemaOrRef) → (value) => { valid: boolean; errors: string[] }`.
- Create: `packages/contracts/src/http.ts`:
  - `operations(doc) → Operation[]`, where `Operation` is `{ id, method, path, request?: SchemaRef, responses: Record<string, SchemaRef | null>, errorCodes: string[] }`;
  - `matchRoute(doc, method, path) → string | undefined`;
  - `validateRequest(bundle, doc, operationId, body)`;
  - `validateResponse(bundle, doc, operationId, status, body)`.
- Create: `schemas/http/README.md`, the convention, and a cases format `fixtures/http/<owner>/<api>.v<N>.cases.json`: `{ operations: { [operationId]: { request?: { valid: {label: body}, invalid: [{why, body}] }, responses: { [status]: { valid, invalid } } } } }`.
- Test: `packages/contracts/test/http.test.ts`, with a test document `packages/contracts/test/fixtures/sample.openapi.json`; and `scripts/openapi.test.ts`, the meta-check over every real document.

**Interfaces:**

- Consumes: Task 2's `schemas/common/error.v1.json`.
- Produces: the five functions above, re-exported from `packages/contracts/src/index.ts`.

- [ ] **Step 1: Write the failing tests** in `http.test.ts`:
  - `matchRoute prefers a literal segment over a parameter` (Review Focus 2);
  - `matchRoute returns undefined for an unknown path and for a wrong method`;
  - `validateResponse resolves a $ref into schemas/common/error.v1.json offline` (Review Focus 5; the test fails if `fetch` is called);
  - `validateRequest refuses a body missing a required field and names the field`;
  - `a status with no schema accepts only an empty body`.
- [ ] **Step 2: Write the failing meta-check** in `scripts/openapi.test.ts`. For every `schemas/http/**/*.openapi.json`:
  - `openapi is 3.1.x`;
  - `operationIds are unique`;
  - `every $ref resolves in the bundle`;
  - `every operation has cases for its request and each response status`;
  - `every case validates as labelled`;
  - `every x-treaty-error-codes entry exists in contracts/error-codes.json with this document's owner`;
  - `the document is named by a registry entry of kind http`.

  With no real documents yet, the meta-check runs over the sample document.

- [ ] **Step 3: Run** `bun test packages/contracts scripts/openapi.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `schemas.ts` and `http.ts`.
  - `loadBundle` reads `schemas/**/*.json` and calls `Validator.addSchema` for each `$id`, so no `$ref` reaches the network.
  - `matchRoute` splits on `/`, scores a literal segment above a parameter, and picks the highest score.
- [ ] **Step 5: Run** the tests and `bun run check`. Expected: PASS.
- [ ] **Step 6: Commit** `contracts: HTTP APIs as OpenAPI 3.1 with cases`.

### Task 4: The compatibility check

**Files:**

- Create: `packages/contracts/src/compat.ts`: `compareSchemas(base, head) → Breaking[]`, where `Breaking` is `{ pointer: string; rule: string }`; and `compareOpenApi(base, head) → Breaking[]`.
- Create: `scripts/compat.ts`: compares every `schemas/**` file between a base git ref and the working tree. The base is the merge base with `origin/main` by default, or `--base <ref>`.
- Create: `contracts/compat-exceptions.json` (`{ "exceptions": [{ path, reason }] }`, empty).
- Modify: `package.json`: add `"compat": "bun scripts/compat.ts"`, and add it to `check` after `lint`.
- Modify: `.forgejo/workflows/ci.yml`: run `bun run compat --base "origin/${{ github.base_ref || 'main' }}"` after lint, fetching the base first.
- Test: `packages/contracts/test/compat.test.ts` and `scripts/compat.test.ts`.

**Interfaces:**

- Produces: these rules, applied recursively through `properties`, `items`, `prefixItems`, `$defs`, `oneOf`/`anyOf`/`allOf` by position:
  - `required-added`;
  - `property-removed`;
  - `type-changed`, any change to the set of types, widening included (Review Focus 1);
  - `enum-narrowed` and `enum-widened` (an old reader refuses a new value);
  - `const-changed`;
  - `additional-properties-closed`;
  - `schema-removed`;
  - and for OpenAPI: `operation-removed`, `method-or-path-changed`, `response-status-removed`, plus every schema rule applied to each request and response schema.
- A new file, or a new `.vN` beside an old one, is never breaking. A breaking change passes only with an entry in `compat-exceptions.json`. An exception for a path the change does not touch fails as stale.
- On top of the structural rules, the corpus rule: base's valid cases must validate under head's schema, and head's valid cases under base's.

- [ ] **Step 1: Write the failing unit tests**, one per rule, each a pair of base and head schemas, for example `widening a type to include null is breaking` and `adding an optional property is not breaking`. Also `an unchanged schema yields nothing`.
- [ ] **Step 2: Write the failing script tests:** set up a temporary git repository, commit a schema, edit it, run `scripts/compat.ts --base HEAD`, and expect exit 1 with the pointer and rule printed. A stale exception exits 1. A new `.v2` file exits 0.
- [ ] **Step 3: Run** `bun test packages/contracts/test/compat.test.ts scripts/compat.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `compat.ts` and the script, and wire them into `package.json` and CI.
- [ ] **Step 5: Run** `bun run check`. Expected: PASS, with `compat` reporting `0 breaking` against `origin/main`.
- [ ] **Step 6: Revert-proof:** temporarily widen a type in `schemas/superpipeline/gate.pending.v1.json` and run `bun run compat`. Expected: exit 1 naming `type-changed`. Restore the file.
- [ ] **Step 7: Commit** `ci: refuse a change that breaks a reader or a writer within a version`.

### Task 5: `@superjackfruitlabs/treaty-contracts`

**Files:**

- Create: `packages/contracts/package.json` (name `@superjackfruitlabs/treaty-contracts`, version `0.0.0`, `bin: { "treaty": "dist/cli.js" }`, runtime dependency `@cfworker/json-schema`), `tsconfig.build.json` and `README.md`.
- Create: `packages/contracts/scripts/bundle.ts`, run by the package's `build`. It copies `schemas/`, `fixtures/` and `contracts/` into `packages/contracts/data/`, and writes `data/manifest.json`: `{ treaty: <version>, files: { [path]: sha256 } }`.
- Create: `packages/contracts/src/index.ts`. It exports `loadBundle`, `validatorFor`, the HTTP functions, `compareSchemas`, `compareOpenApi`, `coverage`, `readRegistry`, and `casesFor(bundle, schemaPath) → { valid: Record<string, unknown>; invalid: { why: string; body: unknown }[] } | undefined`.
- Modify: `scripts/architecture.test.ts` only if the new package needs a new layer entry; never raise a recorded number.
- Test: `packages/contracts/test/bundle.test.ts`.

**Interfaces:**

- Produces: the data at `node_modules/@superjackfruitlabs/treaty-contracts/data/` with `manifest.json`, which Task 6's CLI and every non-TypeScript consumer read.

- [ ] **Step 1: Write the failing tests:**
  - `the bundle holds every file under schemas/, fixtures/ and contracts/`;
  - `manifest hashes match the files`;
  - `manifest.treaty is the package version`;
  - `loadBundle from the built data validates the same as from the repository`.
- [ ] **Step 2: Run** `bun test packages/contracts/test/bundle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the package and its build.
  - `data/` is gitignored and built.
  - `casesFor` reads the cases location named in the registry entry's `cases` map (`{ [schemaPath]: "<fixture path>#<JSON pointer>" }`).
- [ ] **Step 4: Run** `bun run check` and `bun run build`. Expected: PASS, and `packages/contracts/data/manifest.json` exists.
- [ ] **Step 5: Commit** `contracts: one package with the data, the validators and their manifest`.

### Task 6: `treaty verify`, `treaty sync`, `treaty cases`

**Files:**

- Create: `schemas/treaty/product-manifest.v1.json`, the schema of a product's `treaty.json`:
  - `product`;
  - `treaty`, the pinned version;
  - `produces`, registry ids;
  - `consumes`, registry ids;
  - `vendored`, an array of `{ path, source }`.
- Create: `packages/contracts/src/cli.ts` (entry) and `packages/contracts/src/verify.ts`: `verify(manifest, bundle, opts: { repoRoot, latest?, maxBehind? }) → Problem[]`, where `Problem` is `{ code: string; message: string }`.
- Test: `packages/contracts/test/verify.test.ts`, `packages/contracts/test/cli.test.ts`.

**Interfaces:**

- `treaty verify [--manifest treaty.json] [--latest <version>] [--max-behind <n>]` exits 1 and prints one line per problem. The problem codes are:
  - `manifest-invalid`;
  - `unknown-contract`;
  - `not-owner`, when a product lists under `produces` a contract it does not own;
  - `not-a-consumer`, when the registry lacks the product among that contract's consumers;
  - `self-consumer`;
  - `pin-mismatch`, when the installed bundle differs from `treaty`;
  - `pin-behind`;
  - `vendored-missing`;
  - `vendored-drift`, whose message includes `run treaty sync` (Review Focus 3 and 4).
- `treaty sync` rewrites each `vendored[].path` from the bundle byte for byte.
- `treaty cases <schemaPath>` prints `casesFor(...)` as JSON, for test harnesses in Go, Rust, Swift and Python.

- [ ] **Step 1: Write the failing tests:** one per problem code. Each builds a temporary repository with a `treaty.json` and expects exactly that code. Also:
  - `a clean manifest yields no problems`;
  - `sync then verify yields no problems`;
  - `cases prints the gate.pending.v1 corpus`.
- [ ] **Step 2: Run** `bun test packages/contracts/test/verify.test.ts packages/contracts/test/cli.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `verify.ts` and `cli.ts`, with no dependency beyond the package's own.
- [ ] **Step 4: Run** `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `contracts: a treaty CLI any repository can verify itself with`.

### Task 7: Coverage across the workspace

**Files:**

- Create: `scripts/coverage.ts`. `bun scripts/coverage.ts <checkout>...` reads each checkout's `treaty.json` and the registry. It prints:
  - coverage;
  - each registry consumer whose manifest does not declare the contract;
  - each manifest consumer the registry does not list;
  - each pin behind the latest tag.

  It exits 0, since it is a report and not a gate until Phase 4. `--json` writes the same as data.

- Modify: `README.md` (packages table, status), `schemas/README.md` (registry, HTTP, common), `AGENTS.md` (the every-crossing rule, the compatibility check, the registry), `CHANGELOG.md` (`## Unreleased`).
- Test: `scripts/coverage.test.ts`.

- [ ] **Step 1: Write the failing tests** over two fixture checkouts: one agreeing with the registry and one declaring a contract the registry does not list. Expect the second to be reported by id.
- [ ] **Step 2: Run** `bun test scripts/coverage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the script, and update the docs.
- [ ] **Step 4: Run** `bun run check`. Expected: PASS. Then run `bun scripts/coverage.ts ../agentpod ../superpipeline` and confirm it reports the seed coverage, with no manifests found yet.
- [ ] **Step 5: Commit** `contracts: measure coverage across the workspace`.

### After the tasks

- Push `contracts/phase-0` to forge and open one pull request listing the seven commits, linked to the charter PR.
- The operator merges both, tags treaty `v0.0.15`, and bootstraps `@superjackfruitlabs/treaty-contracts` on npm once.
- Write Phase 1's task-level plan.

---

## Appendix: the crossings on 2026-11-22

The seed of `contracts/registry.json`. Evidence for each row is in the sweep and is recorded in the
registry entry's `evidence`.

| id                             | owner         | consumers                                                                                       | kind      | status       | phase |
| ------------------------------ | ------------- | ----------------------------------------------------------------------------------------------- | --------- | ------------ | ----- |
| `treaty.relay`                 | treaty        | superpipeline, superexchange, superdispatch, agentpod                                           | event     | contracted   |       |
| `superpipeline.events`         | superpipeline | superexchange, superdispatch, agentpod                                                          | event     | contracted   |       |
| `superexchange.board-room`     | superexchange | supermessage, agentpod                                                                          | matrix    | contracted   |       |
| `agentpod.harness-permission`  | agentpod      | supermessage                                                                                    | matrix    | contracted   |       |
| `accounts.token-claims`        | accounts      | agentpod, superpipeline, superexchange, superdispatch, superwitness, superlibrary, supertoolkit | token     | partial      | 1     |
| `accounts.identity-corpus`     | accounts      | agentpod, superpipeline, supermessage                                                           | file      | contracted   |       |
| `superbench.local-api`         | superbench    | agentpod                                                                                        | ipc       | partial      | 3     |
| `superbench.checkpoint`        | superbench    | agentpod                                                                                        | file      | contracted   |       |
| `superbench.consumer-bindings` | superbench    | agentpod                                                                                        | ipc       | proposed     | 3     |
| `superpipeline.run-checkpoint` | superpipeline | agentpod, superbench                                                                            | http      | contracted   |       |
| `agentpod.registered-worker`   | agentpod      | superbench                                                                                      | ipc       | contracted   |       |
| `superpipeline.agent-work`     | superpipeline | agentpod, salaam                                                                                | http      | uncontracted | 1     |
| `superpipeline.decisions`      | superpipeline | superexchange, agentpod                                                                         | http      | partial      | 1     |
| `superpipeline.approvals`      | superpipeline | supertoolkit                                                                                    | http      | uncontracted | 1     |
| `accounts.plane-api`           | accounts      | agentpod, superpipeline, superexchange, superdispatch, superwitness, superlibrary, supertoolkit | http      | uncontracted | 1     |
| `accounts.sign-in`             | accounts      | agentpod, superpipeline, superwitness, superlibrary, supermessage                               | http      | standard     |       |
| `agentpod.hub-auth`            | agentpod      | superpipeline, superwitness                                                                     | token     | deprecated   |       |
| `superpipeline.direct-push`    | superpipeline | agentpod, superlibrary                                                                          | http      | partial      | 2     |
| `agentpod.matrix-activity`     | agentpod      | supermessage                                                                                    | matrix    | uncontracted | 2     |
| `agentpod.live-activity`       | agentpod      | supermessage                                                                                    | http      | uncontracted | 2     |
| `agentpod.push-gateway`        | agentpod      | supermessage                                                                                    | http      | standard     |       |
| `superpipeline.board-read`     | superpipeline | superlibrary, superdispatch, superwitness                                                       | http      | uncontracted | 3     |
| `superpipeline.placement`      | superpipeline | superdispatch                                                                                   | http      | uncontracted | 3     |
| `superpipeline.mcp`            | superpipeline | agentpod                                                                                        | mcp       | uncontracted | 3     |
| `agentpod.evidence`            | agentpod      | superwitness, superpipeline                                                                     | http      | uncontracted | 3     |
| `agentpod.capability-catalog`  | agentpod      | superdispatch, superlibrary                                                                     | http      | uncontracted | 3     |
| `agentpod.fleet-api`           | agentpod      | superpipeline                                                                                   | http      | uncontracted | 3     |
| `agentpod.salaam-station`      | agentpod      | salaam                                                                                          | ipc       | uncontracted | 3     |
| `supertoolkit.managed`         | supertoolkit  | salaam, agentpod                                                                                | ipc       | uncontracted | 3     |
| `superwitness.runs`            | superwitness  | superpipeline, superdispatch                                                                    | http      | external     | 3     |
| `superwitness.telemetry`       | superwitness  | agentpod, salaam                                                                                | telemetry | uncontracted | 3     |
| `superlibrary.api`             | superlibrary  | agentpod, superpipeline                                                                         | http      | uncontracted | 3     |
| `accounts.matrix-link`         | accounts      | supermessage                                                                                    | http      | uncontracted | 3     |
| `accounts.hub-import`          | accounts      | agentpod                                                                                        | file      | deprecated   |       |
