# Changelog

Each release publishes every public package in `packages/` to npm at the tag's version, and
deploys the event relay to production.

## Unreleased

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
