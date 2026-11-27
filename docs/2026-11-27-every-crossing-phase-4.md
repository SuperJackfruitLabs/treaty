# Every crossing, phase 4: the station, the toolkit, run reports, the bench and a Go module

**Date:** 2026-11-27. Dated by the day it was written.
**Status:** Proposed, for review. Phase 3 is in production (treaty v0.0.22; coverage 83%, 25 of
30).
**Input:** one read-only sweep on 2026-11-27 of every registry crossing that is `uncontracted`,
`partial`, `proposed` or `external`, with both sides of each read from the product repos' `main`
(agentpod 5faa6025, salaam 7f8d341, supertoolkit 12a7b81, superwitness, superpipeline,
superdispatch, superbench, treaty 6ddf3c2).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** every crossing that runs in code today is a contract in treaty, read from treaty's data
by both sides, and treaty ships a Go module so its Go consumers stop vendoring by hand.

**Architecture:**

- **Local IPC becomes contracts like HTTP.** Salaam's operator socket is HTTP over a Unix socket,
  so it is an OpenAPI document. The stdio messages (station files, host config, stk's `--json`
  output) and the policy file are JSON Schemas with cases, in the form `schemas/superbench/`
  already uses.
- **Copied corpora move into treaty.** Twelve AgentPod–Salaam corpora, the stk handover corpus and
  the two managed-protocol corpora sit as copies in two repos each, and nothing compares the
  copies. They become treaty fixtures, vendored and verified by each side.
- **Run reports join treaty.** SuperWitness keeps publishing the run-report schema at its own URL,
  and treaty holds the same file as the request body of an OpenAPI document. SuperWitness checks
  that its published copy equals treaty's.
- **A Go module** (treaty #59, step 3 moved first): treaty's data, its manifest, a validator
  wrapper and a case runner, published from the same release tag. No generated types yet.

Coverage moves from 83% to 97% (30 of 31; see "Coverage" below).

## What the sweep found

| Crossing                       | Today        | Traffic                                  | Seed material                                             | Blocker                                                                                          |
| ------------------------------ | ------------ | ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `agentpod.salaam-station`      | uncontracted | every Salaam turn                        | 12 corpora, 11 byte-identical; zod in AgentPod's contract | 27 socket operations, 6 station-file actions, 4 host-config messages; a `{code, error}` envelope |
| `supertoolkit.managed`         | uncontracted | the CLI and policy file: every station   | CLI goldens; handover corpus, byte-identical              | the managed protocols are enabled nowhere; the CLI has no JSON errors                            |
| `superwitness.runs`            | external     | every finished run; every placement pass | the run-report schema, byte-identical in both repos       | nested errors with lowercase codes fit no suite envelope                                         |
| `superbench.local-api`         | partial      | a pilot host only                        | 16 schemas in treaty, 2 with cases                        | pinned at six treaty revisions; SuperBench has no `treaty.json`                                  |
| `superbench.consumer-bindings` | proposed     | none                                     | schemas                                                   | no code on either side                                                                           |

Details that shape the tasks:

- **Salaam's socket.** Salaam's route table (`src/service/routes.ts:106-130`) has 24
  `POST /v1/agentpod/<action>` routes. AgentPod's node-agent calls 23 of them (`attach` is Salaam's
  own ACP adapter's) and 3 GETs: `/v1/health`, `/v1/sessions` and `/v1/sessions/{id}/context`.
  Salaam answers every refusal `{code, error}` with a snake code (default status 409), and the
  node-agent reads only `code` (`internal/salaam/client.go:290-300`). Every corpus carries
  `version: 1`; three requests carry `schema_version` strings (`salaam-execution-evidence/v1`,
  `salaam-execution-artifacts/v1`, `salaam-work-trace/v1`).
- **Salaam's copies.** Eleven of the twelve AgentPod–Salaam corpora are the same git blob in
  both repos. `mcp` is the same JSON in different bytes (AgentPod's is prettier-wrapped), and
  `salaam-work-decision-preview-truncated-v1.json` exists only in AgentPod. AgentPod's
  `salaam-conformance.yml` runs Salaam at c05b9d1 (2026-10-21), 354 commits behind Salaam's main.
- **stk as AgentPod uses it.** The node-agent runs ten stk subcommands (`internal/stkclient/
stkclient.go`). Nine print JSON: `version`, `handover key`, `handover open`, `verify`,
  `reload`, `env`, `doctor`, `doctor --probe`, plus `install`. A failure is an exit code and a
  `stk: …` line on stderr. AgentPod writes `/etc/stk/supertoolkit.yaml` (YAML, 0640) from its own
  struct (`forgeapi/stkpolicy/policy.go:263-285`); stk's parser refuses an unknown key
  (`internal/policy/config.go:378`).
- **stk drift, live.**
  - stk's built-in services include `superpipeline-approvals-read` and `-write` (since
    2026-11-08), but AgentPod's `BuiltinServices` list (pinned to stk 9fc1c19) lacks them. A
    forge grant with either name passes AgentPod's collision check and is then silently resolved
    as the built-in.
  - stk accepts `api_prefix` on a forge service; AgentPod cannot write it and refuses any
    instance that needs one.
- **The managed protocols are off.** stk serves `managed-mcp-v1`, `managed-evidence-v1` and
  `managed-control-v1`, and Salaam calls them, but only through a host-manifest key
  (`managed_toolkit`) AgentPod never writes. The local-commands socket needs a flag nothing
  passes.
- **The handover corpus** (`handover-v1.json`, AgentPod's hub seals in TypeScript, stk opens in
  Go) is a crossing the registry does not list.
- **SuperWitness's routes.** SuperPipeline posts `POST /v1/runs` (`runs:write`, a service
  principal) and reads `GET /v1/verdicts?subject_kind=run&subject_ref=`. SuperDispatch reads
  `GET /v1/runs?source=…&status=…&since=…&limit=200&cursor=`. Errors are
  `{"error":{"code","message","retryable"?,"index"?}}` with about 40 lowercase snake codes;
  the entitlement gate answers 403 `{"error":"product_not_enabled","org"}`, which is
  `flat-error.v1`. SuperWitness's MCP server is called by no product: it is an agent's surface,
  not a crossing.
- **SuperBench's pins.** SuperBench's tests pin six treaty revisions by hash (the registry says
  five); AgentPod's pin five more files, one at a SuperBench commit. Every pin is labelled
  PROPOSED. SuperBench has no `treaty.json`; AgentPod's declares the bench crossings and vendors
  none of them. A tag publishes binaries only. Treaty's sweep found a pilot bench host run by
  hand, which no repository describes.

## Rulings this phase applies

These are defaults. Each is a line in a contract, so changing one later is a versioned change.

1. **Salaam's `{code, error}` is recorded as `code-error.v1`, for local IPC only.** Phase 3's
   ruling 2 (no new envelopes for product APIs) stands: this envelope is for a socket and a
   helper on one host, never an HTTP API between products. `code` follows `flat-error.v1`'s code
   pattern, `error` is the message, extra fields are allowed. Salaam's codes join
   `contracts/error-codes.json` under `salaam`. The alternative, moving Salaam to `error.v1`,
   touches 239 codes and both parsers for no reader's gain.
2. **SuperWitness moves to `error.v1`.** Its errors already nest as `error.v1` does; only the
   codes' case differs. SuperWitness sends UPPER_SNAKE codes, its gate refusal is declared as an
   `x-treaty-gate-refusals` 403 in `flat-error.v1`, and its codes join the error-code registry.
   Order: SuperPipeline and SuperDispatch first read either case (both read only the status and a
   code today; task 3 confirms no branch compares a lowercase code), then SuperWitness switches.
   The alternative is widening `error.v1`'s code pattern, which changes a shared envelope for one
   product.
3. **The run-report schema keeps its published `$id`.** Treaty holds it at
   `schemas/superwitness/run-report.v1.json` with the `$id`
   `https://docs.superwitness.dev/schemas/run-report.schema.json` unchanged, as an exception to
   "`$id` is the treaty address" that the registry entry records. SuperWitness vendors it back and
   its docs-claims test compares the published copy with the vendored one.
4. **`supertoolkit.managed` is split by what runs.**
   - `supertoolkit.cli` (new): the nine `--json` outputs and the policy file AgentPod writes,
     with stk's built-in service names as data. Contracted this phase.
   - `supertoolkit.handover` (new): the sealed-envelope corpus between AgentPod's hub and stk.
     Contracted this phase.
   - `supertoolkit.managed` keeps the three managed protocols and the local-commands socket. Its
     corpora move into treaty as data; it becomes `proposed` until a host enables it.
   - stk's CLI errors stay exit codes with text. Contracting them is a CLI change, not a record of
     what ships.
5. **A crossing no code implements leaves the registry.** `superbench.consumer-bindings` has no
   code on either side. Its schemas stay in treaty, its proposal doc stays, and it returns to the
   registry when one side implements it. The registry lists crossings found in code
   (`contracts/README.md`); a proposal is not one.
6. **SuperBench's local API is contracted at one treaty release.** Both sides drop their scattered
   pins for `treaty.json`, `treaty sync` and `treaty verify` at one version, and every one of the
   16 schemas gets cases. The pilot host is the deployment the phase 3 blocker asked for; estate
   writes it down before the proof (task 7).
7. **The Go module comes before the Rust crate, and carries no generated types yet.** Four Go
   consumers read treaty this phase (AgentPod's node-agent, stk, SuperWitness, SuperBench); one
   Rust consumer reads it today. The module holds the data files at their treaty paths,
   `manifest.json`, `Validate(path, value)` over a standard JSON Schema 2020-12 validator, and
   `RunCases(path, parse)`, which feeds every valid and invalid case to a consumer's parse
   function and reports mismatches. Generated types and the open-enum rules (#59, step 2) come
   with the Rust crate, where SuperMessage's core needs them.
8. **Before a strict consumer is released, it reads production bodies.** Phase 3 shipped a reader
   that refused production boards no staging board resembled. Each product task here that adds a
   validator runs it against a sample of production bodies (read-only, by the product's own
   credential) before its release, and the task's PR says how many it read.

## Coverage

| Change                                            | Contracted | Applicable |
| ------------------------------------------------- | ---------- | ---------- |
| Today                                             | 25         | 30         |
| `superbench.consumer-bindings` leaves (ruling 5)  | 25         | 29         |
| `supertoolkit.cli`, `supertoolkit.handover` added | 27         | 31         |
| `agentpod.salaam-station` contracted              | 28         | 31         |
| `superwitness.runs` contracted                    | 29         | 31         |
| `superbench.local-api` contracted                 | 30         | 31         |

97% at the end of the phase. The one left is `supertoolkit.managed`, `proposed` until a host
enables it.

## Release order

1. **treaty `v0.0.23`** carries tasks 1–5 and the Go module's first tag (`go/v0.0.23`).
2. **Producers, in any order:**
   - **Salaam:** vendors the station corpora and checks its routes against the socket document;
     deletes its copies.
   - **SuperToolkit:** tests its `--json` outputs and its policy parser against treaty's schemas,
     and its built-in names against treaty's list; vendors the handover and managed corpora.
   - **SuperWitness:** vendors the runs document; consumers first, then the code switch (ruling
     2).
   - **SuperBench:** gets a `treaty.json`; drops its six pins.
3. **Consumers, after their producer:**
   - **AgentPod:** the node-agent reads the station, stk and bench data through the Go module;
     reads stk's built-in names from treaty (the approvals drift is fixed); bumps its Salaam
     conformance pin to Salaam's main; the hub reads the handover corpus from treaty.
   - **SuperPipeline:** drops its run-report hash pin for treaty's copy; reads verdicts through
     the runs document.
   - **SuperDispatch:** reads `GET /v1/runs` through the runs document.
4. **The staging proof:**
   - a Salaam turn on staging is admitted and settled through `work-admit` and `work-settle`, and
     reads a station file, with both sides checking treaty's corpora;
   - a forge grant on staging writes a policy file that passes treaty's schema, and
     `stk reload --json` reports it `added`;
   - a run reported by SuperPipeline is read back by SuperDispatch through treaty's document;
   - AgentPod's node-agent completes one bench operation against the pilot host;
   - each strict reader has read production bodies first (ruling 8).

---

## Task 1 (treaty): the Salaam station

**Files:**

- Create `schemas/common/code-error.v1.json` (ruling 1); its codes join
  `contracts/error-codes.json` under the owner `salaam`.
- Create `schemas/http/salaam/operator.v1.openapi.json` (`x-treaty-error-envelope:
code-error.v1`, server: the Unix socket `<state>/operator.sock`): the 24 `POST
/v1/agentpod/<action>` routes and the 3 GETs, each request and response written from Salaam's
  validators (`src/core/agentpod-work-protocol.ts`, `agentpod-protocol.ts`) and checked against
  AgentPod's zod (`packages/contract/src/salaam-*.ts`).
- Create `schemas/agentpod-salaam/station-files.v1.json` (the six actions over the helper's
  stdio) and `host-config.v1.json` (`observe`, `plan`, `apply`, `inspect`) and
  `agentpod-pins.v1.json` (the pins file).
- Move the twelve corpora into `fixtures/agentpod-salaam/`, normalising `mcp`'s bytes and adding
  AgentPod's truncated-preview corpus. Each becomes the cases of the operation it exercises.
- Registry: `agentpod.salaam-station` becomes `contracted`; the owner stays AgentPod (it names
  the protocol), Salaam is listed as the side that serves the socket.

## Task 2 (treaty): SuperToolkit's CLI, policy and handover

- Create `schemas/supertoolkit/cli/<command>.v1.json` for the nine `--json` outputs, with stk's
  goldens as valid cases.
- Create `schemas/supertoolkit/policy.v1.json`: the policy file's forge services as AgentPod
  writes them, including `api_prefix` (stk accepts it), and `contracts/supertoolkit/
builtin-services.json`, the names a forge grant may not take.
- Move `handover-v1.json` to `fixtures/supertoolkit/handover-v1.json`.
- Move `managed-mcp-v1.json` and `managed-control-v1.json` to `fixtures/supertoolkit/` as data.
- Registry: add `supertoolkit.cli` and `supertoolkit.handover` (`contracted`);
  `supertoolkit.managed` becomes `proposed` (ruling 4).

## Task 3 (treaty): SuperWitness's runs

- Create `schemas/http/superwitness/runs.v1.openapi.json` (`error.v1`): `POST /v1/runs`
  (`runs:write`), `GET /v1/runs`, `GET /v1/runs/{runId}` and `GET /v1/verdicts`, with the
  entitlement gate as an `x-treaty-gate-refusals` 403.
- Add `schemas/superwitness/run-report.v1.json` (ruling 3), byte for byte the file SuperWitness
  publishes today (sha256 `b2444841…`).
- Cases from SuperWitness's handler tests and SuperPipeline's recorded reports.
- SuperWitness's codes join the error-code registry in UPPER_SNAKE.
- Before ruling 2's switch, confirm by reading both consumers that neither compares a lowercase
  code; record what was read in the PR.
- Registry: `superwitness.runs` becomes `contracted`.

## Task 4 (treaty): SuperBench

- Add cases for the 14 schemas under `schemas/superbench/` that have none; reference
  `registrations/observe` from a request.
- Correct the registry entry (six pinned revisions, not five), then make it `contracted`.
- Remove `superbench.consumer-bindings` from the registry; its proposal doc says it returns when
  code implements it (ruling 5).

## Task 5 (treaty): the Go module

- Create `go/` with `go.mod` (`module github.com/SuperJackfruitLabs/treaty/go`), the data files
  embedded at their treaty paths, `Manifest()`, `Validate(path string, value any) error` and
  `RunCases(path string, parse func([]byte) error) []Mismatch`.
- The release workflow tags `go/vX.Y.Z` beside `vX.Y.Z` and checks that the embedded data's
  sha256s equal `manifest.json`.
- `treaty verify` accepts a pinned Go module version in `treaty.json` in place of a vendored copy.
- Docs: a Go page beside the TypeScript packages page.

## Task 6 (treaty): integrate and release

Merge tasks 1–5 into one pull request. Coverage tests move to 97% (30 of 31). `bun run check`,
`go test ./go/...` and the docs build pass. Then the operator tags `v0.0.23`.

## Product tasks

- **Salaam:** `treaty.json` at 0.0.23; its route table is checked against the operator document;
  its tests read the vendored corpora; its `test/fixtures/agentpod-*` copies are deleted.
- **AgentPod (node-agent, Go):** depends on the Go module; its Salaam client, stk client and
  bench client check what they send and read against it; `BuiltinServices` comes from
  `builtin-services.json`; `ci/salaam-conformance.json` moves to Salaam's current main. **(hub,
  TS):** the handover and station corpora come from treaty; AgentPod's copies are deleted.
- **SuperToolkit:** depends on the Go module; tests each `--json` output, the policy parser and
  the built-in names against treaty; deletes its handover and managed corpora copies.
- **SuperWitness:** vendors the runs document; its docs-claims test compares the published
  run-report schema with treaty's; after both consumers ship, its codes move to UPPER_SNAKE.
- **SuperPipeline:** reads verdicts and posts reports through the runs document; drops
  `test/helpers/run-report-schema.ts`'s hash pin; reads either code case.
- **SuperDispatch:** reads `GET /v1/runs` through the runs document; reads either code case.
- **SuperBench:** a `treaty.json`; its six `source.json` pins replaced by `treaty verify`.
- **estate:** the pilot bench host is written down (what runs, which version, how it is reached)
  before the staging proof.

## Not in this phase

- Treaty #59's Rust crate, generated types and the open-enum codegen rules, Python and Swift
  packages, and consumer-driven compatibility in the release gate.
- Enabling SuperToolkit's managed protocols.
- SuperWitness's MCP server as a catalog: no product names its tools.
