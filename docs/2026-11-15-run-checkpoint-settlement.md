# Run checkpoint settlement

The coordinator-grant design was accepted on 2026-11-16, subject to the
conditions below. The HTTP schemas and conformance corpus here remain
proposed contract data. Design acceptance does not provision a reporter grant,
enable a board or establish implementation conformance.

SuperPipeline owns work runs and advancement; SuperBench enforces stopped
writers, sealed checkpoints, whole-vector remote confirmation and ownership
release. AgentPod executes and relays a delegated observation. Dependencies point
from the suite to SuperBench: standalone SuperBench needs no suite product,
Organization principal or coordinator grant. Coordinator-oriented surfaces are
optional and off by default. Standalone lifecycle and privileged Linux behavior
need repeatable verification. With checkpoint integration disabled, ordinary
claim, completion and dispatch behavior remains unchanged, including an empty
checkpoint-policy field; unavoidable schema changes must be identified explicitly.

The existing Organization issuer and control-pair authorization remain
authoritative. No alternate issuer, network SuperBench endpoint or self-issued
bearer capability is introduced. Reporter provisioning and end-to-end conformance
are enablement gates, not consequences of publishing these schemas.

## Required completion boundary

A mutable display reference is not an immutable checkpoint receipt. A stage,
including a legitimate same-SHA verification, needs its own run-bound observation.
The checkpoint floor is separate from generic completion requirements, so a card
override cannot disable stopped-writer, checkpoint or release guarantees.

## Proposed owner API and data

The new schemas are review candidates, not event catalogue entries:

- `schemas/superpipeline-api/run-checkpoint-policy.v1.json` defines an optional
  **StageDef.checkpointPolicy**, an admin-controlled, nonweakenable safety floor.
  It binds reporterPrincipalId, nodeId, allowed agentId/stationId executors, an
  exact ordered repository/member allowlist, checkpointRepository and
  allowUnchanged. Absent means existing behavior. Card completion overrides cannot
  weaken it. The claim records the canonical policy digest and repository mapping.
- `schemas/superpipeline-api/run-checkpoint.v1.json` defines the immutable observation,
  binding URL board/run, current card/stage/epoch, executing agent/station/node and
  private attempt ID. Body identity or hashes never authorize a caller.
- `schemas/superpipeline-api/checkpoint-settlement.v1.json` defines a dedicated
  **POST /v1/boards/:board/runs/:run/checkpoint-settlements** body containing the
  checkpoint, handoff and outcome. It is a service-only route requiring
  `checkpoints:submit` plus the exact admin-selected reporter principal. Ordinary
  run completion cannot satisfy a policy-enabled stage, even with identical JSON.
  Ordinary stages keep their existing completion behavior. Add producer capability
  discovery before enabling policy.
- `schemas/superpipeline-api/run-checkpoint-receipt.v1.json` defines the cap-free receipt.
  Proposed **GET /v1/boards/:board/runs/:run/checkpoint** requires service-kind
  `checkpoints:read`, current tenant access and the selected reporter principal;
  it does not require an active run lease. This proposal does not grant generic
  run bearers a new receipt-read entitlement.
- Store a separate immutable `run_checkpoint_receipts` row keyed by run and epoch,
  with settlementId, server-derived reporter principal, executing agent binding,
  policyDigest, canonical submission/report bytes and their separate digests,
  observed source provenance, recordedAt and a cap-free historical reply.
  Uniquely bind settlementId within the board; never rewrite proof via card refs.
  Existing displays are projections generated from this row after validation.

The checkpoint report carries a sorted 1–32 member vector. Provider/repository
identities derive from the approved tenant forge or GitHub mapping; no caller URL
selects a service, repo or endpoint. Every task branch is exactly
`card/<bound full cardId>`. Validate source object-format widths, vector coverage,
sorted uniqueness, checkpointRepository/seal object-format binding and policy
equality. JSON Schema does not prove these relations.
Request and reply are at most 64 KiB UTF-8. Reject duplicate keys at every depth,
trailing documents, invalid UTF-8/unpaired surrogates, unknown fields and nulls.
All wire counters are integers in 0..2^53-1. Bound bytes as well as schema lengths.

The report contains neither lease/continuation, paths, command arguments,
environment, logs nor clone URLs. Repository names are canonical owner/repo data,
not credentials. Board references can be derived from the accepted provider map
and exact commit rather than accepting caller-supplied URLs as proof.

## Cards narrow a stage allowlist

The charter decision was amended on 2026-11-22: a card may narrow a stage's
repository allowlist, and the claim freezes the choice. These shapes are proposed
beside the existing ones; nothing above changes for a stage that keeps
`checkpointPolicy`.

- `schemas/superpipeline-api/run-checkpoint-policy.v2.json` is the policy of a
  stage whose cards choose. It is v1 plus `repositorySelection: "card"` and an
  optional `defaultRepositories`, a sorted subset of the allowlist. It sits in
  **StageDef.cardCheckpointPolicy**, never together with `checkpointPolicy`, and
  only workspace owners and admins write it. A v1 reader refuses it.
- `schemas/superpipeline-api/card-repositories.v1.json` is the card's choice:
  `repositories` (1–32 sorted, unique policy names) and an optional
  `primaryRepository`. CardView shows both. Names only: never a provider, URL or
  clone identity. Anyone who may edit the card may set them, within the allowlist.
- `schemas/superpipeline-api/run-checkpoint-selection.v1.json` is what the claim
  freezes: the stage policy digest, how the repositories were chosen (`card`,
  `default` or `single`), the names and the start repository. The claim's
  CheckpointClaimDiscovery carries it as `selection`, and its `policy` is then the
  **narrowed** checkpoint-policy.v1, with `policyDigest` over that. Source
  admission, settlement, references and receipts all compare with the narrowed
  policy, so their shapes are unchanged.

Narrowing keeps the allowlist's order and every field but `repositories` and
`checkpointRepository`. The start repository is the card's `primaryRepository`;
otherwise the stage's `checkpointRepository` when chosen; otherwise the only one
chosen; otherwise the card is refused. A card that names none gets the stage
default, or the allowlist when it has one repository; otherwise it waits for a
person. It never gets the whole allowlist by default. A choice outside the
allowlist is refused on entry; one the allowlist no longer holds at claim parks the
card for a person. Once a bench exists the choice is fixed: reclaim and start a new
bench to change it.

A claimant opts in with `checkpointProtocols` listing
`superpipeline.checkpoint-claim.v2`, sent beside `checkpointProtocol` (still v1,
which a server that predates the field reads and the rest ignore). A stage with
`cardCheckpointPolicy` is offered to no other claimant, so a reader that cannot
check a narrowed claim never receives one.

`fixtures/superpipeline-run-checkpoint/selection.json` holds the structural cases,
the policy relations JSON Schema cannot state, thirteen narrowing vectors with
their digests, and ten producer-state scenarios that are design requirements, not
executed conformance. `canonical.json` adds the v2 policy, a selection, a narrowed
policy and a card choice.

## Authority and source observation

The board receives a **delegated coordinator report**, not an independently
verifiable cryptographic attestation. A SHA256 in the body alone proves nothing.
The accepted Charter decision delegates observation to the coordinator. The work
owner verifies the authenticated reporter and work binding; it does not infer a
Unix-socket, process-scope or remote-publication proof from a hash. Enablement
requires an explicitly provisioned existing-issuer service principal and the
owner-defined scope, audience and organization mapping.

The existing-issuer service principal needs `checkpoints:submit` and
`checkpoints:read`, the configured audience/organization mapping, and an exact
admin-selected stage reporter binding. A generic run-owner credential can be held
by an ordinary harness and is explicitly insufficient, even with valid hashes.
Control-pair dispatch permission is not settlement authority. Store the acting
reporter separately from the executing agent; never impersonate the run owner.
The reporter credential stays in the hub, never the node, worker, private node
capability file or board payload. Node observations travel over the existing
authenticated node channel and are bound to the policy-selected node/executor.
This is trusted delegated observation under the existing same-UID command model,
not hostile-command isolation. Independent source attestation would need a separate
accepted issuer/key/binding design; public forge commits alone cannot prove fencing.

The coordinator validates the entire pinned v2 response and exact original request
binding before producing a report. The response must be successful `run` with
checkpoint omitted/true, the expected registration ID/member inventory, stopped
execution and exit0, complete whole-vector checkpoint, no pending generation,
ready phase and released ownership. An absent current lease or a worker's JSON
`complete` alone is insufficient. The local SuperBench operation semantics must
also guarantee capture/history sealing before this success; the wire's stopped
flag alone does not expose sealing. Consumer/producer lifecycle tests, not an
extra untrusted boolean, must prove that boundary.

`sourceRequestSha256` hashes the exact validated source request with the same
canonical algorithm, binding holder/request/body to the private durable ledger.
Only its digest crosses into the board report; arguments and any supplied token
stay private. The report requestId and run binding must match that ledger.

`sourceReceiptSha256` hashes the complete validated success response after deleting
only `result.root_path` and `result.grant` if present. Preserve all other known
fields and use the canonical algorithm below; a default-checkpoint successful run
must not contain a grant. `workerResultSha256` instead hashes the exact bounded
worker result file bytes. Neither digest is a capability or substitutes for
retaining source evidence. The corpus pins canonical policy/report/source values.

`requestDigest` hashes the entire canonical settlement request, including handoff
and outcome; `reportDigest` hashes only its checkpoint report. Changing the handoff
under an existing settlement ID conflicts even when the report is identical.

Canonical JSON for policy/report/source/submission digests has no whitespace or final newline.
Object keys (all schema keys are ASCII) sort lexicographically by ASCII bytes;
arrays retain their validated order. Integers use ordinary base-10 digits without
leading zero or exponent; booleans are `true`/`false`; null is invalid. Strings quote
and escape double quote and backslash with one backslash. Printable ASCII U+0020
through U+007E is literal except those two characters. Every other scalar uses
lowercase `\uXXXX`; supplementary scalars use a paired surrogate escape. Controls
use `\u000a`-style escapes, not short forms. Reject unpaired input surrogates before
normalization. Hash the resulting ASCII/UTF-8 bytes with SHA256. No floating-point
numbers are accepted. This intentionally explicit format is not JSON.stringify's
default escaping; both producer and consumer must run the canonical vectors.

## Atomic completion and retries

Validate report/binding/policy before ending the run. If hashing or provider mapping validation awaits, reauthorize service scope/reporter policy, executor/run/epoch, heartbeat validity,
current stage and policy digest immediately before the synchronous transaction.
Commit proof receipt, run outcome/handoff, exact generated references and card
advancement together. External effects must be deferred until that transaction commits; a failed
transaction cannot publish success.

A reply keeps the existing card projection and adds checkpointReceipt naming
version, settlementId, reportDigest, requestDigest, reportedBy, runId, leaseEpoch,
recordedAt and the exact
checkpoint. Save the cap-free reply; a replayed card projection is historical,
not authority over its current state. Exact same-principal,
same-binding, same canonical submission bytes replay returns the saved reply even after the
run ended. Check that immutable replay before requiring an active run; compare
principal and digest first. Replays and receipt reads still require current
issuer/scope/tenant authorization; an old receipt does not revive an expired grant.
Never recreate a lease or accept changed bytes under
the same ID. An ended/superseded run without its exact receipt cannot first submit
proof. Another epoch or owner cannot inherit it. A changed stage policy invalidates
an uncommitted report; a completed historical receipt remains historical.

Malformed input is 400/INVALID_CHECKPOINT; unauthorized reporter/executor 403/NOT_CHECKPOINT_REPORTER;
missing required proof or stale epoch/policy 409/CHECKPOINT_REQUIRED or STALE_LEASE;
changed replay bytes 409/CHECKPOINT_CONFLICT. Temporary source unavailability is
503 and must not mutate the run, manufacture a verdict or dispatch another child.
A reclaimed card/new run must not relabel an old produced report. Initially park
and reconcile it; adopting historical proof requires a separately reviewed
board-owned adoption operation with current checkpoint/writer checks. Generic output recovery is not proof adoption.
Lost replies are reconciled by exact settlement replay or authenticated receipt
read, never a fresh child execution. No expiry deletes the evidence.

Changed work requires at least one terminal member SHA to differ from the
recorded pre-execution vector. An unchanged verification is allowed only when
policy permits and every SHA matches the recorded start. It still requires its
own run/epoch, source execution and checkpoint/release operation. Same-SHA stages
must not fabricate an empty Git commit; a new SuperBench generation can record a
new whole-vector observation. Reusing a display reference or old generation
without a current operation receipt does not satisfy either disposition.

Block/fail/cancel can record incomplete work without a success receipt. They do
not clear the SuperBench owner or authorize a replacement writer. A person moving
a card is an administrative work-plane action, not fabricated checkpoint evidence.

## AgentPod integration and cancellation

Persist a private attempt ledger before first effects: tenant/station/node,
board/card/stage/run/epoch, bench key/ID, repository allowlist/card refs, exact
request ID/body digest and worker-context identity. Record preparing/running,
uncertain, stopped, checkpoint-confirmed, released, settlement-produced/reported
and canceled states, source/worker evidence digests and the board receipt.
Capabilities remain private and must not enter board replies, logs or worker data.
Do not rerun pending, in-doubt or lost-transport work; historical receipt replay
never restores ownership. A later holder must never receive a token, be stopped
or be cleared by settlement retry.

Run the worker **inside** the SuperBench supervised run. Preserve common
control-pair, tenant, station and current-node authorization before effects.
Require control-pair configuration for this integration; readiness is not
authorization. Validate current run/epoch for every harness, then recheck routing
under execution exclusion. A missing or unreachable execution host is not
permission to create an independent writer elsewhere. The parent retains
claim/heartbeat credentials, and the hub alone retains reporter authority. The
child receives an environment allowlist and fresh HOME/XDG/TMP, without inherited
board or MCP access. Same-UID access is trusted-command authority, not isolation.

Cancellation must bind the exact source operation across preparation and payload.
Never substitute key-only administrative stop: a delayed request could stop a
later holder. A historical response is not current ownership or permission to
resume preparation. Preserve existing v1 behavior and require explicit support
for held-token grouped operations and operation-bound cancellation.

A deliberately failing-test result can be valid stage evidence with orchestration
exit0; test failure and payload-process failure are different outcomes. Integration
verification still needs an independent clean checkout of the exact pushed vector.
The next Fix run must still pass configured preparation before its payload starts.
If repository setup itself runs the deliberately failing suite, retain the failed
owner rather than bypassing setup. Repositories need dependency preparation
separate from stage validation, or an explicitly reviewed configuration change;
there is no skip-setup escape hatch.

## Implementation and conformance gates

1. Keep the accepted Charter conditions and proposed wire data distinct. Preserve
   accepted local v1 bytes; grouped operations require explicit producer support.
2. Implement policy parsing, capability discovery, immutable receipts, service-only
   submission and authenticated exact replay/read at the work owner. Enforce the
   floor outside card overrides and derive display references from validated proof.
3. Exercise stale owner/epoch, policy override, reused display references, same-SHA
   stages, partial vectors, asynchronous races and atomic-write faults. Verify
   lost-response replay and lexical/size rejection without changing ordinary work.
4. Execute only under the authorized control pair. Prove preparation/payload
   cancellation, retained dirty ownership, child credential exclusion, exact
   source reporting and no redispatch. An explicitly selected checkpoint path
   never falls back to ordinary execution.
5. Enable an explicitly selected board only after reporter provisioning and
   producer/consumer conformance. Verify test, fix and independent clean
   integration against the pushed vector, with sealed members, remote confirmation,
   release and lost-response reconciliation.

The corpus distinguishes schema/lexical rejection from producer-state scenarios.
A wire-only validator cannot establish authenticated ownership, fencing, remote
publication or release. Those cases require actual product integration tests;
schema acceptance alone is not runtime conformance or an enablement grant.
