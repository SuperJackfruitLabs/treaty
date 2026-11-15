# Proposed run checkpoint settlement

Status: proposal for review, not an accepted decision, implemented API, consumer
conformance result or pilot enablement. No board is enabled by these files. The
accepted boundaries are charter's SuperBench lifecycle decision (2026-11-14) and
`evidence-joins-on-the-work-run` (2026-09-29, decisions 2–7 accepted). SuperPipeline
owns work runs and advancement; SuperBench owns stopped writers, checkpoints and
release; AgentPod executes and relays results. The existing Organization issuer
and control-pair authorization stay authoritative. No new token issuer, network
SuperBench endpoint or self-issued bearer capability is proposed. A new scoped service grant from the
existing issuer is a proposed prerequisite, not an already accepted entitlement.

This candidate was prepared from treaty `63af0f8675ef2a35188465884c4416a190f6f41f`,
SuperPipeline `5501b2530824db8d668deafcad7977289b241008`, charter
`175af4afe195e23320c7cced082dcf8f652c812b`, AgentPod base
`f2e95100ffe86924ceef4b059b1f6c0e8febb693` and foundation
`2f13b54ee4757a3942403a0c4a85737d6eb8e109`. The AgentPod base differs from the
previously inspected `e9d6dddab4c6e90fcca5c98f97cb39b8da8bd7d0` in 67 files;
the common `acp/open.ts`, `control/control-pair.ts`, `auth/caller-authority.ts`
and `auth/org-plane/grants.ts` are byte-identical across those bases. The
foundation merged as `6f1ea31f6254357b87be2552526b0ff43056c484` and remains
unconnected to live dispatch. Aggregate SuperBench v2 is
itself proposed; acceptance and consumer conformance are prerequisites for the
full multi-repository pilot. Scalar v1 bytes and ordinary ACP behavior stay intact.

## Concrete existing gaps

SuperPipeline `apps/api/src/board/run-verbs.ts` queries only provider/source_type
from every card reference at completion. `references.ts` upserts by (card,url),
preserves the original run_id on update, and its addRunReference does not itself
derive that field from the authorized run. REST run reference creation currently
omits it. Filtering those mutable display rows by run_id would neither bind a new
stage nor support a legitimate same-SHA verification.

`card.spec.completion` replaces the stage requirement, including `{}`. It must not
become a way to disable the pilot's stopped/checkpoint/release safety condition.
The new safety condition therefore lives separately from generic completion.
Current phase-0 prose and attached references remain useful, but are not this proof.

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
  checkpoint, handoff and outcome. It is a service-only route requiring proposed
  `checkpoints:submit` plus the exact admin-selected reporter principal. Ordinary
  run completion cannot satisfy a policy-enabled stage, even with identical JSON.
  Ordinary stages keep their existing completion behavior. Add producer capability
  discovery before enabling policy; today's producers ignore unknown keys.
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

## Authority and source observation

The board receives a **delegated coordinator report**, not an independently
verifiable cryptographic attestation. A SHA256 in the body alone proves nothing.
The companion proposed Charter decision
[coordinator-grant decision](https://github.com/SuperJackfruitLabs/charter/pull/39)
must be accepted
before this capability is enabled. Existing SuperPipeline service resolution can
separate issuer-verified service principals from generic agent credentials, but
there is no checkpoint reporter scope or route in the inspected source. No
provisioned runtime reporter grant is claimed.

The proposed existing-issuer service principal needs `checkpoints:submit` and
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

Validate report/binding/policy before ending the run. If hashing or a trusted
source/provider check awaits, reauthorize service scope/reporter policy, executor/run/epoch, heartbeat validity,
current stage and policy digest immediately before the synchronous transaction.
Commit proof receipt, run outcome/handoff, exact generated references and card
advancement together. Reuse the async reauthorization pattern already in
run-verbs.complete's approval-subject path, not its generic early endRun order.

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
board-owned adoption operation with current checkpoint/writer checks. The generic
bridge findUnreportedOutput behavior is not proof adoption.
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

Run the worker **inside** benchd.run. Preserve createSession's control-pair grant,
tenant/station/current-node authorization and explicit board/station opt-in before
any new payload path. Require the control-pair gate to be configured on for the
pilot and share its common authorization path rather than relying on readiness.
The inspected createSession revalidates execution runs only for Salaam; the new
pilot driver must freshly validate current run/epoch for every harness before
effects, then recheck tenant/station/current-node routing. Keep a fixed pilot SuperBench host; an unreachable old host
is not permission to create an independent writer elsewhere. Parent retains board
claim/heartbeat credentials, and the hub alone retains reporter authority; child receives an environment allowlist
and fresh HOME/XDG/TMP, without inherited board/MCP access. Same-UID filesystem
access is trusted-command authority, not isolation.

V1 cannot lease then reuse that token in run. Its foundation uses run-owned
acquisition, and a private worker cancellation channel cannot interrupt configured
setup that runs before the payload. Do not cancel by key-only stop_admin: a late
request could stop another holder. Full pilot cancellation needs the reviewed v2
held-token path and an operation-bound cancellation design spanning setup/payload;
it remains a contract/integration requirement, not solved by this proposal.
A deliberately failing-test result can be valid stage evidence with orchestration
exit0; test failure and payload-process failure are different outcomes. Integration
verification still needs an independent clean checkout of the exact pushed vector.
The next Fix run must still pass configured preparation before its payload starts.
If repository setup itself runs the deliberately failing suite, retain the failed
owner rather than bypassing setup. Pilot repositories need dependency preparation
separate from stage validation, or an explicitly reviewed configuration change;
there is no skip-setup escape hatch.

## Owner-first implementation sequence and tests

1. Accept the trust/receipt/policy boundary in charter; review these Treaty schema,
   request/reply, canonical digest and stateful corpus additions. Preserve accepted
   local v1 bytes; aggregate v2 acceptance remains an explicit prerequisite.
2. Implement SuperPipeline policy parsing, capability discovery, immutable receipt
   schema, service-only settlement and exact replay/read; enforce policy outside card overrides. Change
   model/rpc/routes/run-verbs and add a dedicated checkpoint module below board.
   Generate references as projections; do not retrofit immutable proof into PUT.
3. Add canonical conformance tests to SuperPipeline contract/API, including stale
   owner/epoch, card override, old ref, same URL, partial vector and async races;
   fault atomic proof/reference/advance writes and lost-reply replay. Keep ordinary
   completion unchanged. Add fixture-derived lexical/size rejection tests.
4. Implement the opt-in AgentPod driver/ledger under the authorized control pair,
   consuming the accepted local v2 result. Prove actual setup/payload cancellation,
   retained dirty owner, no credentials in child, exact source report, no redispatch
   and settlement replay. No automatic ACP fallback for a configured pilot.
5. Enable only Developer Experience after producer capability/acceptance and
   staging conformance. Prove failing-test -> fix -> independent clean integrate,
   one group lease, every member sealed and remote-confirmed, safe release and
   lost-response reconciliation. Observe board refs/receipt and preserve evidence.

The candidate corpus distinguishes schema/lexical rejection from producer-state
scenarios; a wire-only validator cannot know the authenticated owner, fence,
remote result or released state. The stateful cases require real product tests.
The current candidate is design input, not completed conformance evidence.
