# Changelog

Each release publishes every public package in `packages/` to npm at the tag's version, and
deploys the event relay to production.

## Unreleased

### Added

- **A Go module, `github.com/SuperJackfruitLabs/treaty`** (`go.mod` at the repository root), released by the same `vX.Y.Z` tag as the npm packages: `go get github.com/SuperJackfruitLabs/treaty@vX.Y.Z`. It embeds `schemas/`, `fixtures/` and `contracts/` at their treaty paths and exports `Manifest()` (every JSON file's sha256, the same as the npm package's `data/manifest.json`), `Validate(path, value)` (JSON Schema 2020-12 through `santhosh-tekuri/jsonschema/v6`, formats asserted, ECMA-262 patterns, every `$ref` from the embedded data and never the network) and `RunCases(path, parse)`, which feeds every valid and invalid case of a schema, or of an OpenAPI operation body addressed as `<document>#<operationId>/request` or `#<operationId>/<status>`, to your parse function and reports the ones it read the other way. No generated types. CI runs `go vet` and `go test`, which check every corpus case is read as labelled and that the module embeds exactly the npm package's files; the release checks that again at the tag before publishing. Documented at `/packages/go/`.
- **`treaty verify` accepts a pinned Go module in place of vendored copies:** `goModules` in `treaty.json` lists `go.mod` files that must require `github.com/SuperJackfruitLabs/treaty` at exactly the pinned release, with no `replace` for it (`go-module-missing`, `go-module-unpinned`, `go-module-replaced`). The field is in `schemas/treaty/product-manifest.v2.json`; every v1 `treaty.json` is a v2 one, and `verify` now checks against v2.
- **SuperToolkit's CLI is a contract** (`supertoolkit.cli`, phase 4 ruling 4). `schemas/supertoolkit/cli/` holds the stdout of the seven `stk … --json` commands AgentPod's node-agent reads (`handover key`, `handover open`, `verify`, `reload`, `env`, `doctor`, `doctor --probe`), written from stk's code, with stk's characterization goldens as valid cases (`fixtures/supertoolkit/cli.json`). A failure's exit code and stderr text are not contracted.
- **The stk policy file is a contract** (`schemas/supertoolkit/policy.v1.json`): `supertoolkit.yaml`'s forge services as AgentPod writes them, plus `api_prefix`, which stk accepts, as JSON Schema over the YAML's data model. Cases in `fixtures/supertoolkit/policy.json`.
- **stk's built-in service names are data** (`contracts/supertoolkit/builtin-services.json`, form `schemas/treaty/builtin-services.v1.json`): thirteen names, including `superpipeline-approvals-read` and `-write`, which AgentPod's own list lacks. The policy schema refuses a forge service under any of them.
- **The hand-over envelope corpus is a contract** (`supertoolkit.handover`, `fixtures/supertoolkit/handover-v1.json`), byte for byte the copy AgentPod and SuperToolkit each hold today.

### Changed

- **`supertoolkit.managed` is `proposed`**: the managed MCP and control corpora move into treaty as data (`fixtures/supertoolkit/managed-mcp-v1.json`, `managed-control-v1.json`, byte for byte stk's); no host enables the managed protocols yet. Coverage is 84% (27 of 32).

## v0.0.22 — 2026-11-26

### Added

- **SuperBench's remote credential request and reply are contracts, proposed** (`schemas/superbench/remote-credential-request.v1.json`, `schemas/superbench/remote-credential-response.v1.json`). `POST /v2/remote/credentials` on SuperBench's local socket asks for a writer certificate for a public key on the lease its token owns. The request is closed: `version`, `operation`, `key`, a 32-hex `lease_token` and a `public_key`. The reply is a closed envelope: `ok` with a `result` of the nine credential fields, including the absolute `working_directory` every session starts in, or `ok: false` with an error code. Certificates for ecdsa client keys (`ecdsa-sha2-nistp256-cert-v01`) are accepted as well as ed25519. Cases are in `fixtures/superbench-api/remote-credentials.json`, registered on `superbench.local-api` (the crossing stays partial; SuperBench produces it on its remote-access branch and no consumer is deployed against it). Described in `docs/2026-11-14-superbench-local-api.md`.

## v0.0.21 — 2026-11-24

### Fixed

- **A SuperPipeline stage's `order` is optional** (`StageDef` in `schemas/http/superpipeline/board-read.v1.openapi.json` and `agent-work.v1.openapi.json`). SuperPipeline has never required it: board create needs only a stage's `key` and the whole-pipeline write its `key` and `name`, and both store stages as sent. A board whose stages were sent without `order` has always been read back without it, so a reader validating v0.0.20 strictly (SuperDispatch's placement pass) refused real boards at `#/stages/0`. `key` and `name` stay required, and `order`, when present, is a number. `stages` is always in board order: a reader orders stages by their position in the array. New cases: a board snapshot whose stages have no `order`, and a claim and a run read whose stage has none. This widens two v1 responses in place, as the charter's decision for a contract wrong about what ships allows (charter#47): the five findings are recorded in `contracts/compat-exceptions.json` against v0.0.20. The lapsed v0.0.19 entries are removed.

## v0.0.20 — 2026-11-24

- **Registry evidence:** `agentpod.evidence` cited Salaam's copied `test/fixtures/execution-evidence-v1.schema.json`, which Salaam deleted when it began vendoring treaty's data; it now cites `salaam:treaty.json` and `salaam:test/unit/agentpod-work.test.ts`. Every other evidence path for Salaam, SuperWitness and SuperMessage exists on their main.
- **AgentPod's execution evidence cases match the hub.** `readExecutionEvidence`'s corpus case put three executions in one envelope, two of them of the same task and session; AgentPod's hub answers at most one (the run's latest snapshot), and SuperWitness refuses two of one session as a conflicting join. Each corpus execution is now its own envelope, `ExecutionEvidenceResponse` states that executions in an envelope have distinct sessions, and a test holds the cases to it. The schema is unchanged: JSON Schema cannot say it, and `x-uniqueBy` is checked only for Matrix content.
- **SuperLibrary's `ItemSummary` describes ingested work records** (`schemas/http/superlibrary/api.v1.openapi.json`). `createdBy` is a `prn_` principal or `source:superpipeline`, the one source SuperLibrary's ingest writes items as; `latestVersion` may be 0, which only an ingested work record with no uploaded version has. A source creates only work records, and version 0 is only theirs. SuperLibrary has always sent these; the contract now says so, and SuperLibrary can drop its two `ALLOWED_MISMATCHES`. This widens a v1 response in place, so `bun run compat` reports it: the six findings are recorded in `contracts/compat-exceptions.json` against v0.0.19 and stop applying once v0.0.20 is out.
- **A gate's refusal is contracted** (`x-treaty-gate-refusals`). SuperPipeline's Organization-plane entitlement check runs before any route and refuses a token whose workspace has not enabled SuperPipeline with the plane's flat `{ "error": "product_not_enabled", "org" }`, not error.v1. All six SuperPipeline HTTP documents (agent-work, approvals, board-read, decisions, placement, push) now declare it once at document level, in flat-error.v1, with cases; `product_not_enabled` joins `contracts/error-codes.json` for superpipeline in flat-error.v1. An operation still names only codes in its document's envelope. `checkOpenApi` checks the declaration (status, envelope, the owner's codes in that envelope, a schema that is that envelope, valid and invalid cases carrying a named code), `validateResponse` accepts the gate's refusal at its status on every operation, and `bun run compat` treats a gate removed or its body changed as breaking. SuperPipeline can drop its `readBoard 403` allowance once it adds `schemas/common/flat-error.v1.json` to its test bundle; its body does not change.

## v0.0.19 — 2026-11-24

- **SuperPipeline's board reads and placement are contracts.**
  - `schemas/http/superpipeline/board-read.v1.openapi.json` (`cards:read`): the board list, the board snapshot, one card, and a card's attempts, comments, links and activities. The run evidence routes `…/runs/{runId}/evidence` and `…/evidence-v1` are in it too, on `evidence:read`. The evidence shapes are closed: C4 is frozen, and `superpipeline-run-evidence/v1` is read strictly.
  - `schemas/http/superpipeline/placement.v1.openapi.json`: card eligibility (`dispatch:read`), reservation `PUT`/`DELETE` (`dispatch:reserve`), scheduling `GET`/`PUT`, and `GET /v1/agents/load` (`dispatch:read`). The load route is proposed: SuperPipeline builds it to this shape, `{agents: [{agentId, principalId, inFlight, capacity, lastHeartbeatAt}]}`.
  - Cases for both in `fixtures/http/superpipeline/`. SuperPipeline's `run-evidence-v1.json` fixture and its recorded C4 examples are now cases of the evidence routes.
  - `superpipeline.board-read` and `superpipeline.placement` are contracted. Coverage is 60%: 18 of 30 crossings contracted.
- **SuperLibrary's API** (`schemas/http/superlibrary/api.v1.openapi.json`, flat-error.v1): every route another product calls. The uploads (`createUpload`, `putUploadFile`, `commitUpload`, `verifyUpload`) for the AgentPod hub and console, `relatedWork`, `invalidateRoster`, and SuperPipeline's `me`, `getItem`, `embedItem` and `widenItemScope`, with cases.
  - SuperLibrary's refusals carry fields beside `error`. Each error response pins them with an if/then on the envelope, for example `path`, `reason` and `rule` beside path_refused, `missing` beside incomplete, `findings` beside secret_found.
  - Its 32 codes join `contracts/error-codes.json`. A code is now unique within its owner, not across products: SuperLibrary and Accounts both answer `not_permitted`.
- **Error cases are checked.** When an HTTP contract gives cases for a 4xx or 5xx response, `checkOpenApi` validates them as labelled.
- **Artifact records** (`contracts/artifacts/`, `schemas/treaty/artifact.v1.json`): code one product ships to another as built files, recorded by version, commit and SHA-256. The first is SuperLibrary's embed 0.0.1, which SuperPipeline vendors. `superlibrary.api` lists it.
- Coverage 57%: 17 of 30 crossings contracted.
- **A standard error envelope, `schemas/common/oauth-bearer-error.v1.json`:** RFC 6750's `{ "error", "error_description" }`, for routes that refuse an OAuth bearer token in that shape. Its three codes are RFC 6750's, listed in the schema's `$defs/standardCode`, and need no entry in `contracts/error-codes.json`; an owner's extension codes are its `flat-error.v1` codes. `checkOpenApi` now also refuses a code recorded in another envelope than the document's, so one product may answer in more than one envelope (AgentPod: Matrix for Live Activity, flat for its service reads).
- **AgentPod's capability catalog and board roster** (`schemas/http/agentpod/capability-catalog.v1.openapi.json`): `GET /api/catalog`, `/api/catalog/stations` and `/api/catalog/stations/{id}`, and the bridge reads `GET /api/bridge/principals/{prn}/boards`, `/api/bridge/stations/{id}` (SuperLibrary's station-owner read, which the registry did not list) and `/api/bridge/boards/{boardId}/roster`, with cases. Refusals are `flat-error.v1`: `unauthorized`, `forbidden`, `product_not_enabled`, and the snake codes AgentPod moves to from its free-text errors, `invalid_station`, `invalid_principal`, `invalid_board` and `not_found`. A station's credentials are closed objects, so a credential value in an answer fails. `agentpod.capability-catalog` is contracted.
- **AgentPod's fleet list** (`schemas/http/agentpod/fleet.v1.openapi.json`): `GET /api/fleet/dispatchable`, the agents a person's token may dispatch, for SuperPipeline's picker. Its refusals are `oauth-bearer-error.v1`: 401 `invalid_token` with an `error_description`, and 403 `product_not_enabled`. `agentpod.fleet-api` is contracted.
- **AgentPod's execution evidence schemas move into treaty:** `schemas/agentpod/execution-export.v1.json`, `execution-evidence.v1.json` and `execution-artifacts.v1.json`, unchanged from AgentPod's generated files but for `$id`, `title` and `description`, with AgentPod's three corpora as cases in `fixtures/agentpod-evidence/examples.json`. Salaam and SuperWitness can vendor them instead of holding copies.
- **AgentPod's evidence reads** (`schemas/http/agentpod/evidence.v1.openapi.json`): the seven GETs under `/api/evidence/`: an export's receipt and a run's executions, each refusing any `schema_version` but its one with `unsupported_evidence_version`; a run's dispatch and attempts; an attempt's run; a principal's kind; and a session's transcript, page and item, with a `WireItem` schema for transcript items (every kind, partial items, truncation markers). The export receipt's URL is the one SuperPipeline stores on a run's evidence reference. Six evidence codes join `contracts/error-codes.json`. `agentpod.evidence` is contracted.
- Coverage 63%: 19 of 30 crossings contracted.
- **A new contract form: the MCP tool catalog** (`schemas/treaty/mcp-catalog.v1.json`). A catalog at `schemas/mcp/<server>.v<N>.json` lists each tool's name, the scope a caller needs to be offered it (or null), its description, its input JSON Schema as `tools/list` sends it and the shape of what it returns; `error` names what a result with `isError: true` carries. Cases live at `fixtures/mcp/<server>.v<N>.cases.json`, per tool. `@superjackfruitlabs/treaty-contracts` reads it: `mcpCatalog(bundle, "<server>.v1")`, `validateToolArguments`, `validateToolResult` (a whole `tools/call` result), `validateToolPayload`, `unknownTools` and `checkMcpCatalog`. `treaty cases <path> --at <JSON pointer>` prints any cases a contract's cases file holds. `bun run compat` compares catalogs tool by tool: a tool added is no finding, a tool removed, a scope changed or an input narrowed is. A `$ref` inside a schema reached through an array (an OpenAPI parameter, a catalog's tool) now resolves against its document.
- **SuperPipeline's MCP tools are contracted** (`schemas/mcp/superpipeline.v1.json`): the 15 tools of `apps/api/src/mcp/tools.ts` with their `TOOL_SCOPE` scopes, the input schemas the server sends in `tools/list`, the result each returns and the `{error: {code, message}}` a refusal carries, with valid and invalid arguments for every tool in `fixtures/mcp/superpipeline.v1.cases.json`. `superpipeline.mcp` is contracted; coverage 57%, 17 of 30 crossings.
- **The suite's telemetry conventions are contracted** (`schemas/telemetry/suite.v1.json`): the `dispatch`, `attempt` and `turn` spans of AgentPod's hub and SuperPipeline's `run_route` span and `run route` log line, the keys each must carry (`run.id`, `board.id`, `card.id`, `station.id`, `attempt.id`, `attempt.state`, `acp.session_id`, `acp.seq_from`, `acp.seq_to`, `harness.name`, `run.epoch` and the rest) with their types, and the ACP `_meta.traceparent` convention (W3C version 00, nonzero ids) with its HTTP twin. Cases in `fixtures/telemetry/suite.v1.cases.json`. `superwitness.telemetry` is contracted, with SuperPipeline listed as a producer; coverage 60%, 18 of 30.
- **The Matrix account link is contracted** as two URL shapes: `schemas/urls/accounts-matrix-link.v1.json`, the Accounts page `/link/matrix` whose fragment carries the homeserver's OpenID token `t`, the server name `s` and `app=1` (https, or http to the device itself), and `schemas/urls/supermessage-linked.v1.json`, the `supermessage://linked?mxid=` callback the page returns to. Cases in `fixtures/urls/`. `accounts.matrix-link` is contracted; coverage 63%, 19 of 30.
- **A new contract form: telemetry conventions** (`schemas/treaty/telemetry-conventions.v1.json`). Conventions at `schemas/telemetry/<name>.v<N>.json` name each attribute key and its OpenTelemetry type (`string`, `int`, `double`, `boolean`, with an optional `enum` or `minimum`), the spans and structured log records that carry them with the keys each must carry, and how trace context travels (`propagation`: an ACP `_meta` or HTTP headers, each field with a JSON Schema). Attribute data, not a schema for traces: keys it does not name are ignored, and telemetry stays best-effort. `telemetryConventions(bundle, "<name>.v1")`, `validateSpanAttributes`, `validateLogRecord`, `validatePropagation`, `validateAttributes` and `checkTelemetryConventions` read it; `bun run compat` compares conventions key by key.
- **A new contract form: URL shapes** (`schemas/treaty/url-shape.v1.json`). A shape at `schemas/urls/<name>.v<N>.json` names the origins a URL may have (a scheme, optionally a list of hosts), its exact path, and its query and fragment parameters, each required or not with a JSON Schema for its decoded value; its cases are URLs. `urlShape(bundle, "<name>.v1")`, `validateUrl(bundle, shape, url)` and `checkUrlShape` read it, with the WHATWG URL parser. A parameter the shape does not name is ignored; a named one may appear once; a URL with credentials is refused. `bun run compat` compares shapes and runs each side's URLs under the other.

## v0.0.18 — 2026-11-23

- **A cancelled gate has a receipt.** `dev.superpipeline.gate.outcome.v1` gains the decision `cancelled`, for a gate the board ended without a decision (its card was moved by hand or archived while the review was pending). `GATE_CANCELLED_DECISION` names it, and `gateOutcomeBody` says it as a whole sentence that names nobody. The schema now lists the decisions it carries in `x-treaty-known-values`; the field stays an open string, and a reader that does not know a value still closes the card.

## v0.0.17 — 2026-11-22

- **Events: one delivery contract on both paths.**
  - `work.available.v1` and `cards.stale.v1` schemas, with their cases and catalogue entries.
  - `schemas/http/superpipeline/push.v1.openapi.json` for push registration.
  - `fixtures/cloudevents/push-delivery.json`: signed vectors for SuperPipeline's direct push on the relay's envelope (CloudEvents binary mode, `x-treaty-signature`, one id per event).
  - The receiver status contract: 2xx handled or ignored, 503 retry, other 4xx refused.
  - The relay's delivery now times out after 10 s, below its 30 s `ack_wait`.
- **AgentPod's chat activity in `schemas/matrix/`:** `dev.agentpod.turn.v1`, the three to-device deltas (`stream.delta`, `thought.delta`, `tool.update`) and the three content keys (`turn_error`, `voice_transcript`, `voice_reply`).
  - Each names its carrier in `x-treaty-carrier`.
  - Enums are open to readers (`x-treaty-known-values`).
  - `schema_version` is an integer of at least 1, read best-effort.
- **Live Activity:**
  - `schemas/http/agentpod/live-activity.v1.openapi.json`;
  - `schemas/agentpod/fleet-content-state.v1.json` and `live-activity-payload.v1.json`;
  - the fleet fixtures, as cases;
  - a third error envelope, `schemas/common/matrix-error.v1.json`.

  `contracts/error-codes.json` moves to `schemas/treaty/error-codes.v2.json`, whose envelope list adds matrix-error.v1, published beside v1.

- Coverage 53%: 16 of 30 crossings contracted.

- **A card may narrow a stage's repository allowlist (proposed).** `run-checkpoint-policy.v2` is the policy of a stage whose cards choose (`repositorySelection: "card"`, optional `defaultRepositories`), carried in the new `StageDef.cardCheckpointPolicy`. `card-repositories.v1` is the card's choice, also on `CardView` as `repositories` and `primaryRepository`. `run-checkpoint-selection.v1` is what a claim freezes, carried as `selection` on the checkpoint claim and source snapshot, whose `policy` is then the narrowed v1 policy. A claimant opts in with `checkpointProtocols` listing `superpipeline.checkpoint-claim.v2`. All additive: v1 policies, claimants and settlement shapes are unchanged. Vectors in `fixtures/superpipeline-run-checkpoint/selection.json`. Follows the charter amendment of 2026-11-22.
- **contracts: parameters are validated too.** `validateParameters()` checks path, query and header values against an operation's parameters, converting URL text to the schema's type, and `routeParams()` gives a request's path values. A pointer through an array (an OpenAPI `parameters/N/schema`) now resolves, and `resolvePointer` walks arrays. Accounts' contract hook did this by hand.
- **`bun run compat` compares with the latest release.** Consumers pin releases, so only what a release holds can break. It no longer compares with whatever commit came before, which flagged a contract changed twice between releases. The nine in-place widenings of SuperBench v2 made since v0.0.14 are recorded in `contracts/compat-exceptions.json` against that release, and stop applying once v0.0.15 is out.
- **HTTP contracts for the work loop, decisions, approvals and Accounts** (`schemas/http/`): SuperPipeline's agent work loop and run checkpoints (`agent-work.v1`), its decision write-back and pending reads (`decisions.v1`, whose list items are the pushed event bodies), its approvals API (`approvals.v1`), and the Accounts API (`accounts/plane.v1`), each with valid and invalid cases. Six crossings are now contracted: coverage 43%. These describe the target error envelope; SuperPipeline moves to it in its own change before its consumers move.
- **Two error envelopes:** `schemas/common/flat-error.v1.json` (Accounts' `{ "error": "snake_code" }`) beside `error.v1`. An HTTP contract declares its envelope with `x-treaty-error-envelope`. `contracts/error-codes.json` holds all 156 codes the two products return, each with its status and envelope.
- **ecosystem-identity: one access-token verifier.** `verifyAccessToken(token, { jwks, issuer, audience, product, now? })` returns the claims or throws `AccessTokenError` with a code from a closed set; `createJwksCache` feeds it keys (3 s timeout, one unknown-kid refetch per 30 s, stale while revalidate). The rules: EdDSA over Ed25519 only, `kid` required, 30 s leeway on `exp`/`nbf`/`iat`, lifetime at most 300 s, `jti`, `mayDispatch` and `mayGrantReach` required, `sub` and `org` in the id grammar, and any non-prn `mayDispatch` value refuses the token (Accounts' reference verifier dropped such values). `fixtures/ecosystem-identity/token_vectors.json` holds 43 cases signed by a test-only key for a `.test` issuer, with no private key published, so a verifier in any language can prove it agrees. The package now depends on `jose` 6.2.12.
- **New package, `@superjackfruitlabs/treaty-contracts`:** every contract as data with a sha256 manifest, validators for JSON Schemas and OpenAPI 3.1 documents (`validatorFor`, `openApi`, `matchRoute`, `validateRequest`, `validateResponse`), and the `treaty` CLI (`verify`, `sync`, `cases`). The main entry runs in Workers; `./node` adds the filesystem pieces. A product declares what it produces and consumes in `treaty.json` (`schemas/treaty/product-manifest.v1.json`).
- `contracts/registry.json` lists all 34 crossings between products found on 2026-11-22 (7 contracted, 23% coverage); `scripts/coverage.ts` reports it across the workspace.
- `schemas/common/error.v1.json` and `contracts/error-codes.json`: the one error envelope and a code registry, seeded with four SuperPipeline codes.
- `bun run compat` refuses a change that breaks a reader or a writer within a version. Widening an enum or a type in place, as the SuperBench v2 phase change below did, now needs a new version or a recorded exception.

- Add the SuperBench v2 `reclaim` operation (key only) and the `reclaiming` and `reclaimed` workspace phases to the request and response schemas, with wire vectors, retry and interrupted-reply obligations; re-creation on a reclaimed key is marked PROPOSED. The v2 response phase enum is widened in place, so a consumer that validates phases strictly must accept `reclaiming` and `reclaimed` before the producer enables reclaim; the producer emits them only after a reclaim.

- Propose explicit bounded finite execution I/O and private complete registration observations beside SuperBench v2; preserve legacy encodings and limits without enabling either crossing.

- Propose a private AgentPod registered-worker capsule/result schema and exact framing/canonical cases, separate from public reader data and lifecycle authority.

- Propose a bounded logical-capacity refusal code for SuperBench workspace responses without changing quota limits, request identity or replay behavior.

- Propose SuperBench card associations, advisory locality and lifecycle evidence data beside the existing reader proposal; card associations remain stable across fresh reader snapshots, and no event catalog or authority is enabled.

- Keep the SuperBench v1 and checkpoint-generation boundary documentation public-facing without private owner links or implementation-status notes.

- matrix-events: a gate's room message lists the artifacts its run linked, one `- [title](url)`
  line each, or says "This run linked no artifact". Deliveries without `references` render as
  before. Malformed references are ignored rather than thrown on, only http(s) links are written,
  and titles and URLs are escaped so a reference cannot add a link of its own.

- Align public checkpoint documentation with the accepted coordinator boundary, keep proposed reader/extension enablement separate, and use canonical reader schema URLs.

- Propose bounded SuperBench reader observations and shared refusal cases for mixed inventory, retained checkpoint history, files, diffs and logs; no viewer authority or listener is enabled.

- Propose bounded host-local read-only receipt lookup for interrupted SuperBench source replies; preserve all existing operation/cancellation contracts and keep deployment disabled.

- Propose operation-bound SuperBench cancellation schemas, source-digest goldens
  and runtime obligations; existing v1/v2 bytes and accepted authority stay unchanged.

- Propose coordinator-authorized per-run checkpoint settlement HTTP schemas and
  fixtures for the accepted coordinator design; reporter provisioning and enablement remain separate gates.

- Propose optional SuperBench v2 transfer availability so retired sources remain
  visible without advertising writer acquisition or grants.

- Propose bounded SuperBench v2 responses, explicit operation-scoped lease grants,
  complete mixed status and shared lifecycle obligations alongside unchanged requests.

- Propose versioned SuperBench workspace requests for aggregate creation,
  initialization, member-targeted execution and whole-bench reconciliation.

- Add a proposed SuperBench checkpoint-generation manifest and shared validation
  cases for complete multi-repository vectors, generation pins and sealed recovery.

- Extend the proposed SuperBench local API with initial-setup outcomes and
  retained ownership on creation failure; add shared creation cases and reject
  request-level setup bypass flags.

- Add proposed SuperBench local-operation schema and shared conformance vectors.

- Documentation at [treaty.superjackfruit.com](https://treaty.superjackfruit.com): what treaty is,
  the envelope, versioning, the relay, the packages and fixtures, and a page for every event and
  Matrix event schema, generated from the schemas and fixtures at build time.

## v0.0.13 — 2026-11-12

- `treaty-event-schemas`: `card.ready` v1, the event a board opted into scheduling sends when a
  card becomes ready to claim, with the end of its placement window.
- Releases run on the suite's shared release workflow: the tag gate reads forge CI's result for
  the tag's commit, the packages publish to npm before the relay deploys, a failed relay smoke
  check puts the previous release back, and every tag gets release notes on GitHub.
- Contributors: lint is type-aware and a ratchet (per-rule counts may fall, never rise), and an
  architecture test holds the repository to no import cycles, files under 1,000 lines and the
  existing layer order (`docs/code-quality.md`). The matrix examples builder is split into
  smaller files; the corpus it writes and the packages' exports are unchanged.

## v0.0.12 — 2026-11-12

- `treaty-event-schemas`: schemas for the board-chat events SuperPipeline pushes.
- `treaty-matrix-events`: a subject's `expires_at` must be a strict RFC 3339 date-time.

## v0.0.11 — 2026-11-12

- `treaty-matrix-events`: board-room names per carrier.

## v0.0.10 — 2026-11-11

- `treaty-matrix-events` holds rules SuperMessage already enforces: a subject's revision is a
  whole number, a decision card has at least one option, and a permission carries at most twenty
  options.

## v0.0.9 — 2026-11-11

- The relay's image copies every workspace package's manifest, so the relay builds and deploys
  again. This is the release that brought the relay in production up to date after v0.0.8.

## v0.0.8 — 2026-11-11

- New package `@superjackfruitlabs/treaty-matrix-events`: the board-room Matrix event contract,
  moved here so SuperExchange and SuperMessage check the same rules.
- The packages published; the relay's production deploy failed at this tag (fixed in v0.0.9).

## v0.0.7 — 2026-11-11

- The relay runs in production, deployed by a version tag. A release that fails its health and
  smoke checks puts the release before it back.

## v0.0.6 — 2026-11-10

- The relay: carries events from Workers to NATS JetStream and back, over signed HTTP. It runs on
  staging.

## v0.0.5 — 2026-11-10

- New package `@superjackfruitlabs/treaty-outbox`: write events in the same transaction as the
  change that caused them, and handle each incoming event once.

## v0.0.4 — 2026-11-10

- New package `@superjackfruitlabs/treaty-event-schemas`: the first event schemas, SuperPipeline's
  `gate.pending`, `elicitation.pending` and record events.

## v0.0.3 — 2026-11-10

- `treaty-cloudevents`: the CloudEvents codec, binary mode over HTTP and NATS, and the suite's
  event type and source names.

## v0.0.2 — 2026-11-10

- `treaty-ecosystem-identity`: token claims v9, with the organization plane's own copy merged into
  the corpus.

## v0.0.1 — 2026-11-10

- First release. The shared identity fixture corpus is published as
  `@superjackfruitlabs/treaty-ecosystem-identity`, and a version tag publishes every public
  package to npm with provenance.
