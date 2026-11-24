# Every crossing, phase 3: the read APIs, the agent's tools, evidence and telemetry

**Date:** 2026-11-23. Dated by the day it was written.
**Status:** Proposed, for review. Phase 2 is in production (treaty v0.0.17, 2026-11-23); its
cleanup (SuperPipeline v0.0.37) and the cancelled gate outcome (treaty v0.0.18) are releasing.
**Input:** one read-only sweep on 2026-11-23 of every registry crossing that is `uncontracted`,
`partial` or `proposed`, with both sides of each in the product repos.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** every hot read between products, the agent's tool set, run evidence, telemetry and the
account link are contracts in treaty, and each consumer reads them from treaty's data instead of
a hand-typed copy.

**Architecture:**

- **More OpenAPI documents, checked the way phase 1's are.** SuperPipeline's board reads and
  placement, AgentPod's capability catalog, fleet list and evidence, and SuperLibrary's API become
  OpenAPI 3.1 documents with cases. Producers already run every response on a contracted route
  through treaty's validators; each producer adds its new documents to that hook.
- **Three new contract forms**, each plain data so Go, Rust and Python can read it:
  - an **MCP tool catalog** (`schemas/mcp/`): each tool's name, scope, input schema and result
    shape, with cases;
  - **telemetry conventions** (`schemas/telemetry/`): span names and attribute keys with their
    types;
  - **URL shapes** (`schemas/urls/`): a URL's path, fragment or query parameters, with cases.
- **Copies become vendored data.** The run-evidence and execution-export fixtures that sit
  byte-identical in three repos move into treaty, and each repo vendors them with
  `treaty sync` and checks them with `treaty verify`.

Coverage moves from 53% to 83%: nine crossings become contracted (25 of 30).

## What the sweep found

| Crossing                       | Today        | Traffic                                                       | Seed material                                                        | Blocker                                                                                                              |
| ------------------------------ | ------------ | ------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `superpipeline.board-read`     | uncontracted | hot: every placement pass, every record event, every run view | zod entities, the run-evidence fixture                               | the snapshot and card views are TS interfaces                                                                        |
| `superpipeline.placement`      | uncontracted | hot: every placement pass                                     | —                                                                    | **live drift:** SuperDispatch calls `GET /v1/agents/load`, which SuperPipeline never built; it 404s and is swallowed |
| `superpipeline.mcp`            | uncontracted | hot: every dispatched turn                                    | zod input shapes for 15 tools                                        | no contract form for MCP                                                                                             |
| `agentpod.capability-catalog`  | uncontracted | hot: every placement pass                                     | zod catalog types                                                    | free-text errors (`{error:"not found"}`) fail `flat-error.v1`                                                        |
| `agentpod.fleet-api`           | uncontracted | rare                                                          | —                                                                    | OAuth bearer errors, a fourth envelope                                                                               |
| `agentpod.evidence`            | uncontracted | every run view                                                | three JSON Schemas and fixtures, copied into SuperWitness and Salaam | Go consumer; transcript items have no schema                                                                         |
| `superlibrary.api`             | uncontracted | hot when related work is on                                   | zod in a private package                                             | the embed is JavaScript                                                                                              |
| `superwitness.telemetry`       | uncontracted | every turn, best-effort                                       | recorded traces                                                      | no contract form; SuperPipeline is a producer the registry omits                                                     |
| `accounts.matrix-link`         | uncontracted | once per person                                               | —                                                                    | a URL, not JSON                                                                                                      |
| `agentpod.salaam-station`      | uncontracted | every Salaam turn                                             | 12 corpora, already byte-identical                                   | 24 routes; a sixth envelope (`{code, error}`)                                                                        |
| `supertoolkit.managed`         | uncontracted | the CLI and policy file: every station                        | corpora, CLI goldens                                                 | the managed protocols are not enabled anywhere                                                                       |
| `superbench.local-api`         | partial      | none in production                                            | pinned by commit hash                                                | no production deployment                                                                                             |
| `superbench.consumer-bindings` | proposed     | none                                                          | schemas                                                              | not accepted                                                                                                         |

The last four stay out of this phase (ruling 8).

## Rulings this phase applies

These are defaults. Each is a line in a contract, so changing one later is a versioned change.

1. **SuperPipeline builds `GET /v1/agents/load`.** SuperDispatch's README, changelog and docs
   already promise it, and placing work across every agent (`SUPERDISPATCH_CANDIDATES=all`) needs
   each agent's load. The shape is the one SuperDispatch reads today:
   `{agents: [{agentId, principalId, inFlight, capacity, lastHeartbeatAt}]}`, scope
   `dispatch:read`. The alternative is that SuperDispatch drops the call and the docs that
   promise it.
2. **No new error envelopes for product APIs.**
   - AgentPod's catalog and roster routes move their free-text errors to `flat-error.v1` snake
     codes (`not_found`, `invalid_station`, `invalid_board`, `invalid_principal`). Consumers read
     only the status today, so this is safe.
   - `agentpod.fleet-api`'s bearer-token refusals stay RFC 6750 (`{error, error_description}`):
     treaty records them as a **standard** envelope, `oauth-bearer-error`, not a fourth suite
     envelope.
   - Salaam's `{code, error}` waits for its crossing (ruling 8).
3. **An MCP contract is a tool catalog.** `schemas/mcp/<server>.v1.json` lists each tool's name,
   required scope, input JSON Schema and result shape; a cases file holds valid and invalid
   arguments per tool. The producer's test compares its registered tools with the catalog, name
   for name. A consumer that names tools in a prompt checks each name is in the catalog. Business
   failures stay `isError: true` text, as MCP defines them.
4. **Telemetry conventions are attribute data, not a schema for traces.** The file names the span
   names, each attribute key and its type, and which keys a span must carry. Producers test what
   they emit; the consumer (SuperWitness) queries only keys the file names. Telemetry stays
   best-effort: a missing attribute is a test failure, never a runtime refusal.
5. **A URL shape is a contract like a body.** `schemas/urls/<name>.v1.json` names the path, the
   parameters (fragment or query), their patterns, and a cases file of valid and invalid URLs.
   Phase 3 has two: the account-link page and its callback. Cross-product deep links
   (`SUPERPIPELINE_BOARD_URL`, `SUPERLIBRARY_APP_URL`) are listed in the registry as `standard`
   only if they are plain origins; any path they build becomes a URL shape later.
6. **Go and Rust consumers vendor, for now.** SuperWitness and the node-agent read treaty's data
   through `treaty sync` and `treaty verify`, as SuperMessage does. Generated per-language
   packages (treaty #59) stay a later phase; this phase adds three Go consumers, which is the
   reason #59's Go module comes before its Rust crate when that phase starts.
7. **SuperLibrary's embed stays a product artifact.** Treaty records its version and hash in the
   registry entry; SuperPipeline's hash pin stays where it is.
8. **Out of this phase:** `agentpod.salaam-station` (size and its envelope),
   `supertoolkit.managed` (its protocols are not enabled; its CLI JSON and policy file may be
   contracted earlier as a `partial` if time allows), and both SuperBench crossings (no production
   deployment). They are phase 4, with treaty #59.

## Release order

1. **treaty `v0.0.19`** carries every treaty task below.
2. **Producers, in any order:**
   - **SuperPipeline:** builds `agents/load`; adds `board-read`, `placement` and `mcp` to its
     contract hook; emits the telemetry attributes the conventions name.
   - **AgentPod:** moves the catalog and roster errors to snake codes; adds `capability-catalog`,
     `fleet-api` and `evidence` to its contract hook; the hub's spans are checked against the
     conventions; closes the two phase-2 leftovers.
   - **SuperLibrary:** adds `superlibrary.api` to its contract hook.
   - **Accounts:** the link page's URL and callback are checked against their shapes.
3. **Consumers, in any order after their producer:**
   - **SuperDispatch:** gets a `treaty.json`; reads the board, placement and roster through
     treaty's validators; `agents/load` works.
   - **SuperWitness:** vendors the board-read, evidence and telemetry data; its Go adapters'
     recorded payloads are replaced by treaty's cases.
   - **SuperLibrary** (as a consumer of board-read and the catalog), **AgentPod** (of the MCP
     catalog and SuperLibrary's API), **SuperPipeline** (of the fleet list and SuperLibrary's
     API), **SuperMessage** (of the URL shapes), **Salaam** (drops its copied evidence fixtures).
4. **The staging proof:**
   - SuperDispatch places a card using `agents/load` on a board opted into scheduling;
   - an agent turn on a dispatched card calls SuperPipeline's tools, and every call matches the
     catalog;
   - SuperWitness shows a run whose evidence and trace come through treaty's shapes;
   - a person links a Matrix account from SuperMessage through the URL shapes.

---

## Task 1 (treaty): SuperPipeline's reads and placement

**Files:**

- Create `schemas/http/superpipeline/board-read.v1.openapi.json` (`error.v1`, scope
  `cards:read`): `GET /v1/boards`, `/v1/boards/{boardId}` (the board snapshot),
  `/cards/{cardId}`, `/attempts`, `/comments`, `/links`, `/activities`, and the run-evidence
  routes `GET /v1/boards/{boardId}/runs/{runId}/evidence` and `/evidence-v1`.
- Create `schemas/http/superpipeline/placement.v1.openapi.json` (`error.v1`): eligibility
  (`dispatch:read`), reservation `PUT`/`DELETE` (`dispatch:reserve`), scheduling `GET`/`PUT`, and
  `GET /v1/agents/load` (ruling 1).
- Move SuperPipeline's `run-evidence-v1.json` fixture into treaty as a case.
- Cases for both in `fixtures/http/superpipeline/`.
- Error codes: `BOARD_NOT_FOUND`, `CARD_NOT_FOUND`, `RUN_NOT_FOUND`, `INVALID_RESERVATION`,
  `CARD_RESERVED`, `CARD_NOT_CLAIMABLE`, `AGENT_NOT_ELIGIBLE`, `AGENT_NOT_FOUND`,
  `INVALID_SCHEDULING` join `contracts/error-codes.json` with their statuses.
- Registry: `superpipeline.board-read` and `superpipeline.placement` become `contracted`; fix the
  board-read evidence for SuperWitness (it reads the run-evidence routes).

## Task 2 (treaty): AgentPod's catalog, fleet list and evidence

- Create `schemas/http/agentpod/capability-catalog.v1.openapi.json` (`flat-error.v1`): the three
  catalog routes and the three bridge routes, including `GET /api/bridge/stations/{id}`, which
  SuperLibrary reads and the registry omits.
- Create `schemas/http/agentpod/fleet.v1.openapi.json`: `GET /api/fleet/dispatchable`, with the
  `oauth-bearer-error` envelope (ruling 2) as `schemas/common/oauth-bearer-error.v1.json`.
- Create `schemas/http/agentpod/evidence.v1.openapi.json` (`flat-error.v1`): the seven evidence
  routes, their `schema_version` parameters, and a `WireItem` schema for transcript items. Move
  AgentPod's `execution-export-v1`, `execution-evidence-v1` and `execution-artifacts-v1` schemas
  and fixtures into `schemas/agentpod/` with their cases.
- Error codes: the catalog's new snake codes and evidence's ~15 codes join the error-code
  registry.
- Registry: the three crossings become `contracted`; the evidence entry names SuperPipeline's
  export URL builder.

## Task 3 (treaty): the MCP tool catalog

- Add the form (ruling 3): `schemas/treaty/mcp-catalog.v1.json`, the schema a catalog file
  follows, and validator support in `@superjackfruitlabs/treaty-contracts`
  (`mcpCatalog(name)`, `validateToolArguments(tool, args)`, `validateToolResult(tool, result)`).
- Create `schemas/mcp/superpipeline.v1.json` with the 15 tools and their scopes, and
  `fixtures/mcp/superpipeline.v1.cases.json`.
- Registry: `superpipeline.mcp` becomes `contracted`; its evidence names
  `packages/contract/src/card-prompt.ts`, where AgentPod names the tools.

## Task 4 (treaty): SuperLibrary's API

- Create `schemas/http/superlibrary/api.v1.openapi.json` (`flat-error.v1` with its extra fields
  allowed): the uploads routes, items, embed scope, related work, `me` and roster invalidation —
  every route a consumer calls today.
- The 21 upload refusal codes join the error-code registry.
- Registry: `superlibrary.api` becomes `contracted`, its embed recorded by version and hash
  (ruling 7); the AgentPod console joins its consumers.

## Task 5 (treaty): telemetry conventions and URL shapes

- Add both forms: `schemas/treaty/telemetry-conventions.v1.json` and
  `schemas/treaty/url-shape.v1.json`, with validator support (`telemetryConventions(name)`,
  `validateUrl(shape, url)`).
- Create `schemas/telemetry/suite.v1.json`: span names `dispatch`, `attempt`, `turn`; the keys
  `run.id`, `attempt.id`, `attempt.state`, `acp.session_id`, `acp.seq_from`, `acp.seq_to`,
  `station.id`, `harness.name`, `run.epoch`, `card.id`, `board.id`; and the ACP
  `_meta.traceparent` convention.
- Create `schemas/urls/accounts-matrix-link.v1.json` (the page, fragment `t`, `s`, `app`) and
  `schemas/urls/supermessage-linked.v1.json` (the callback), with cases.
- Registry: `superwitness.telemetry` (SuperPipeline added as a producer) and
  `accounts.matrix-link` become `contracted`.

## Task 6 (treaty): integrate and release

Merge tasks 1–5 into one pull request. Coverage tests move to 83% (25 contracted). The docs
site lists the new forms and documents. `bun run check` and the docs build pass. Then the
operator tags `v0.0.19`.

## Product tasks

Each is one pull request in its repository, with that repository's CI run locally before
pushing, pinned to `0.0.19`.

### SuperPipeline (producer)

1. **`GET /v1/agents/load`** (ruling 1): each agent's in-flight cards, its capacity and its last
   heartbeat, scope `dispatch:read`.
2. **The contract hook covers `board-read`, `placement`** and their error codes.
3. **The MCP server matches the catalog.** A test compares the registered tools, scopes and input
   schemas with `schemas/mcp/superpipeline.v1.json`, and every tool's cases run through the real
   handlers.
4. **Telemetry.** The Workers' trace and log fields are checked against the conventions.
5. **As a consumer:** the fleet list (assignee picker) and SuperLibrary's reads go through
   treaty's validators.

### AgentPod

1. **Snake error codes** on the catalog and roster routes (ruling 2).
2. **The contract hook covers `capability-catalog`, `fleet-api` and `evidence`.**
3. **The hub's spans** are checked against the conventions; the node-agent's `traceparent`
   rewrite has a test against the convention.
4. **As a consumer:** the card prompt's tool names are checked against the MCP catalog;
   SuperLibrary's upload, related-work and roster calls go through treaty's validators.
5. **Phase 2 leftovers:**
   - with a relay configured, `pushEventsFor` stops subscribing the ten decision events the relay
     already delivers (keep the list for a hub without a relay; `elicitation.pending`'s separate
     service config stays);
   - the hub manages Hermes's `agent.reasoning_effort` as a reconcilable setting, so a staging
     station can stream thought deltas without a hand edit. Check agentpod#560 first: the live
     plugin's nightly run failed on 2026-11-23.

### SuperLibrary

1. **The contract hook covers `superlibrary.api`.**
2. **As a consumer:** board-read and the station read go through treaty's validators instead of
   `as T` casts.

### SuperDispatch

1. **A `treaty.json`** consuming `superpipeline.board-read`, `superpipeline.placement`,
   `agentpod.capability-catalog` and the events it already reads.
2. **Its readers use treaty's validators**, keeping their defensive parsing only where a field is
   optional in the contract.
3. **`agents/load` works**, and its docs stop describing a route that 404s.

### SuperWitness

1. **Vendored data** for board-read's run evidence, AgentPod's evidence and the telemetry
   conventions, with `treaty verify` in CI.
2. **Its recorded payloads are replaced** by treaty's cases (`internal/contracts/*.json`,
   `internal/source/testdata/*`), and its Go adapters run every case.
3. Move its treaty pin from 0.0.15 to 0.0.19.

### Accounts, SuperMessage, Salaam

- **Accounts:** the link page's URL and callback are tested against their shapes.
- **SuperMessage:** `account_link.rs` builds and parses through the vendored URL shapes.
- **Salaam:** its copied evidence fixtures become vendored data.

## Review focus

1. **`agents/load` under load.** A capacity of zero, an agent with no heartbeat, and an agent on
   two boards each place nothing wrong.
2. **A tool the catalog doesn't name.** A new SuperPipeline tool fails the producer's test until
   the catalog lists it, and a prompt naming a removed tool fails AgentPod's test.
3. **A newer evidence version.** A `schema_version` the consumer doesn't know is refused with
   `unsupported_evidence_version`, never parsed as v1.
4. **The catalog's error change.** No consumer matched the old free-text strings; the move to
   snake codes changes no consumer's behaviour.
5. **Telemetry stays best-effort.** A span missing a key fails a test, never a request.
