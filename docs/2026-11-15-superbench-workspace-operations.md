# SuperBench workspace operation requests v2

Status: proposed request and response contract for aggregate benches. This is not
an implementation, accepted response contract, deployment or consumer-conformance claim.
The accepted host-local ownership boundary remains unchanged. V1 operations and
their canonical bytes remain supported beside this proposal.

Canonical requests: `schemas/superbench/operation.v2.json`. Shared structural,
semantic and lexical cases: `fixtures/superbench-api/workspace-operations.json`.
These are plain data, not CloudEvents or Accounts tokens. The test adapter is
not a producer and cannot establish ownership or stopped-writer evidence.

## Transport and authority

The intended crossing is POST `/v2/operations` over a host-local Unix socket with
`version: "superbench.v2"`. The kernel peer uid determines operator/reader
authority. Body/header uid, role, admin or holder claims grant nothing. This
adds no TCP proxy, remote audience, tenant boundary or alternative issuer.

Decode at most 64 KiB before allocating a receipt or mutating a bench. Reject
duplicate keys at every depth, trailing documents, invalid UTF-8, unpaired
Unicode surrogates, nulls, unknown fields/versions and operation-inappropriate
fields. Strings contain Unicode scalar values. Argument entries are at most
8192 UTF-8 bytes; short branch/base names at most 255. Existing ASCII key,
holder, request-id and opaque token bounds are retained.

Reader peers may request status/host_status. All mutations require operator
authority. A lease token remains a holder capability, not proof of a session,
principal, work run or completed fence. A timeout, client disconnect or missing
response never authorizes another holder.

## Requests

| Operation                       | Required operation fields                                                        | Optional operation fields                      |
| ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| `create`                        | `key`, `repositories`, `checkpoint_repository`, `initialize: true`, `request_id` | `quota_bytes`                                  |
| `recover`                       | `key`, `repositories`, `source`, `initialize: true`, `request_id`                | `quota_bytes`                                  |
| `status`                        | none                                                                             | `key`                                          |
| `host_status`                   | none                                                                             | none                                           |
| `lease`                         | `key`, `holder`, `request_id`                                                    | none                                           |
| `run`                           | `key`, `holder`, `arguments`, `request_id`                                       | `checkpoint`, `repository_name`, `lease_token` |
| `setup`                         | `key`, `holder`, `request_id`                                                    | `offline`, `repository_name`, `lease_token`    |
| `checkpoint`, `release`, `stop` | `key`, `lease_token`                                                             | none                                           |
| `stop_admin`, `archive`         | `key`                                                                            | none                                           |

Every request also requires version and operation. Reconciliation deliberately
does not require a new request receipt: receipt-budget exhaustion must not
disable checkpoint/release/stop. Growth request IDs bind the exact body to the
authenticated peer. Interrupted receipts require inspection rather than automatic
redispatch. Replay does not recreate ownership that has since ended.

`stop_admin` is a distinct operator action; no admin flag exists. `archive`
cannot change the normal persisted grace or approve deletion. Reviewed reap
remains local administration outside this request set.

## Member selection and creation

`repositories` contains 1–32 entries, sorted by unique lowercase logical name.
Each name matches `[a-z0-9][a-z0-9_-]{0,63}` and derives a member directory
beneath the single bench root. No arbitrary checkout path is accepted.

Creation entries contain exactly `name`, `repository`, optional `branch` and
optional `base`. Branch defaults to `bench/<key>` and base to `main`.
`checkpoint_repository` names one member that will hold the final generation
seal. Duplicate `(repository, effective branch)` targets are invalid even when
one branch was omitted and the other supplied explicitly. Multiple distinct
branches on the same authorized repository remain possible.

Repository identities use the credential-free transport and 4096 UTF-8 byte
rules in the [checkpoint-generation contract](2026-11-15-superbench-checkpoint-generations.md).
Short branch names must satisfy Git grammar without `refs/`, option prefixes,
`HEAD`, `@` or history-dependent substitutions. Names/identities are not
authorization grants; the producer validates the registered mirror/origin and
derives every local path.

V2 creation requires explicit warm initialization; `false`, omission and bypass
flags are invalid. The producer must journal the entire member/source vector
before checkout effects and reserve one initialization owner before preparation.
A failure in a later member preserves earlier materialization and held ownership.
Readiness requires every member's initialization and the complete confirmed
generation, not merely the existence of the first checkout.

`quota_bytes`, when present, requests one total bench budget: positive whole KiB
through 1 PiB, always bounded by root host policy. It cannot multiply a budget
by member count or request per-member privileged limits. Member configuration
requests must be reconciled explicitly by the aggregate producer; they are not
independent quota projects. Repository and host policy cannot be silently resized
through an existing lease or a request retry.

## Exact recovery selection

Recovery entries contain exactly `name`, `repository` and optional new `branch`;
`base` is invalid. The allowlist must match the sealed member names and identities.
`source` contains exactly `repository`, `bench_id`, `commit` and
`manifest_sha256`. The source repository must occur in that explicit allowlist.
It locates one exact metadata seal, not independently latest task branches.

Validate the complete seal, raw-byte digest and every remote pin before
publishing registration. Pin failures or partial materialization preserve work
for reconciliation. New task branches default to `bench/<new key>`; recovering
an older generation must not reset or force original task branches backward.
A new local bench identity records its source relationship explicitly rather
than pretending to restore an old live lease. Reassignment still requires
independent evidence that the prior writer stopped.

## One writer across the whole bench

Lease, stop, checkpoint and release apply to all members. They accept no member
selector. Checkpoint captures the complete clean HEAD vector before any push,
retains an exact pending generation after partial publication, and completes
only after the final remote seal. Release revalidates the entire vector and
stopped-writer evidence. One successful member can never clear the bench lease.

`repository_name` selects a validated member for a run or setup. Run omission
means the bench root; setup omission means all members. It never means an
arbitrary cwd. Once/each preparation, cache selection and retained output remain
protected by the single lease even when several repositories are prepared.

An optional run/setup token explicitly requests reuse of that same held lease.
Runtime must verify exact ownership/holder and completed process fencing before
any new stage; a running, unknown or unfenced execution refuses. It is not a
takeover mechanism or an automatic continuation of a stopped request. Configured
preparation remains required; tokens do not supply a setup bypass.

## Compatibility and producer acceptance

Publish this request proposal before the producer pin. A dual-version producer
must preserve existing v1 single-repository behavior. V1 access to an aggregate
bench must refuse before member effects rather than return a scalar checkpoint
or release one member. A v2-requiring client must not fall back to v1 after an
unsupported-version response. Response and complete lifecycle fixtures follow
the implemented producer before suite consumers use them.

Producer proof must cover two-or-more-repository creation/recovery, partial
checkout/setup/push/state failures, whole-bench ownership, stopped-writer
handoffs, exact sealed recovery, quota exhaustion, member-target validation,
archive/reap, mixed-version refusals and receipt/retry behavior. The shared
request tests establish shape and data constraints only. They do not prove these
runtime obligations or a live suite pilot.

## Proposed responses

This proposal now includes `schemas/superbench/response.v2.json`, shared
`fixtures/superbench-api/workspace-responses.json`, and the separate runtime
obligations in `fixtures/superbench-api/workspace-lifecycle.json`. They establish
plain-data checks, not response acceptance, deployment, a running producer or
consumer conformance. V1 and the v2 request bytes remain unchanged.

Responses require `version: "superbench.v2"`, `ok`, and a typed result on success
or `{code,message}` error on failure. Parsed requests retain their operation;
growth requests echo their exact request ID on successes and failures. Nongrowth
responses have no request ID. Before a valid request is decoded, errors contain
neither operation, request ID nor result. Missing/unknown request version or
operation, malformed IDs and invalid fields are early failures; submitted identity
is never partly trusted. The v2 endpoint still emits the v2 response version.
Missing response version, identity mismatch, unknown fields, nulls, duplicate
keys, trailing documents, invalid UTF-8/surrogates and contradictory HTTP/result
states fail closed. Clients never fall back to v1 after unsupported v2.

Mutation results contain a compact `workspace`, optional explicit `grant` with
only `lease_token`, and one optional `root_path`. Workspace includes its key/BID,
phase, member count, coordinator name, quota caps, redacted lease/execution,
complete checkpoint, pending generation, recovery link and archive state when
present. Completed checkpoints have a seal; pending generations do not. Both
carry complete ordered name/commit vectors and manifest digests, without raw
manifest repository identities, pin refs or paths. Readiness is exactly ready
phase with no lease, pending generation, archive or `transfer_state`. A staged directory, historical
preparation proof, root path or success flag alone grants no writer authority.

The optional `transfer_state` is `relinquishing` or `transferred` for an outgoing
original-ref handoff. It is availability evidence, separate from initialization
`phase`: the source stays `ready` until archive, while acquisition is permanently
blocked. Relinquishing is ready-only; transferred sources may remain in ready,
archived, reaping or reaped inventory. Both require a complete checkpoint and
no lease or pending generation, always report `ready_for_acquisition: false`, and
never accompany a grant. Only this bounded state is public; retirement scope,
protected history, storage/quarantine paths and private ownership remain local.

This is a proposed producer-first response extension. Non-transfer responses omit
the field and keep their existing bytes. Updated validators accept omission and
the new field; older strict v2 clients reject the extra field safely and must be
updated before consuming transfer inventory. The addition creates no request,
network crossing, issuer or consumer-acceptance claim. The v1 boundary is unchanged.

`root_path` occurs once for a registration independently bound to create/recover,
or a new explicit grant. It is absolute/canonical and at most 4096 UTF-8 bytes.
The producer checks derived response representability before allocating a growth
receipt or performing growth effects. Longer existing paths are preserved and
refuse new growth; root-free reconciliation remains available.

Grants are operation-specific, independently authorized evidence, never a raw
copy of whatever lease a record happens to contain:

| Operation                  | Grant and completion rule                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create/recover             | Success completes warm initialization and releases. Partial failure may return only its exact authenticated request-bound initialization grant; replay never reveals a later holder.                                                            |
| lease                      | New acquisition prepares all members. Success or partial preparation failure may return only the owner acquired by this operation. Busy reveals no other token.                                                                                 |
| run                        | Omitted token acquires one owner; supplied token requires exact holder and continuation validation and is never re-exported. Omitted/true checkpoint completes the whole checkpoint and releases; false retains stopped ownership.              |
| setup                      | Same acquire/reuse rule. Success, including selected-member setup, requires whole-vector checkpoint/release. Another member's missing proof or dirty work blocks completion and retains the owner.                                              |
| checkpoint/release/stop    | Never return a grant merely because a held or submitted token was valid. Stop fences and retains the lease with continuation revoked.                                                                                                           |
| stop_admin                 | Only a successful independently verified operator fence may return an explicit recovery grant. It stays stopped with continuation revoked, authorizing reconciliation rather than a new continuation. Failed or unknown fences return no grant. |
| archive/status/host_status | Never return a grant.                                                                                                                                                                                                                           |

Run/setup results may expose execution ID/phase, a known exit code and truncation
flag, never a log path. Internal unknown exit sentinels are omitted. Setup gives
bounded selected-member preparation outcomes; stopped phase alone does not prove
success. All mutation results omit repository URLs, repeated checkout paths,
private continuations, history growth, log/control paths, arguments and environment.
V2 mutations target aggregate registrations only; scalar keys refuse before
receipts/effects. The original v1 scalar behavior remains separate.

## Complete status and budgets

Status returns a key-sorted complete `benches` array with explicit `kind: scalar`
or `kind: workspace` variants, including retained archived/reaping/reaped records.
Aggregate inventory adds all ordered member names, branches, object formats and
source commits. Scalar active state makes no warm-initialization claim. A
specific-key query returns exactly that kind or not_found. Global status cannot
omit either kind, truncate or silently paginate. If its complete output exceeds
1 MiB, unavailable has no partial inventory and directs a specific-key query.
Status contains no grant/token, paths, repository URLs or private metadata.

Host status reuses the existing redacted `{managed,data_free_bytes,state_free_bytes}`
report, not raw host configuration, helper paths, devices or a quota ledger.
Every wire count and observation is a safe integer in 0..2^53-1; quotas remain
at most 1 PiB and inode caps at most 2^40. Unrepresentable host observations return
unavailable, never clamp or round. These observations authorize no allocation.

The 1 MiB response transport limit and 64 KiB growth receipt reservation remain
hard bounds. Growth results, including retained failures and receipt-save errors,
fit the smaller bound. With at most 32 members, compact vectors plus a worst-case
JSON-escaped 4096-byte root fit; tests measure encoded bytes, not character counts.
The unchanged receipt caps are 10,000 entries and 64 MiB of encoded/reserved
responses. Exhaustion refuses new growth, not checkpoint/release/stop/archive or
reviewed local reap. There is no automatic receipt deletion.

Receipt identity binds the kernel UID, operation/version, request ID and canonical
body digest. Core creation identity derives from the same authenticated context;
matching a key or holder label is insufficient. Completed receipts replay exact
historical bytes only to the same UID/body. Running receipts yield in_progress;
interrupted or ambiguous receipts yield operation_in_doubt without redispatch.
Missing completion evidence is reconciliation, not proof that effects never ran.
A cached token does not restore an ended lease; current status/capability checks
govern later actions. Disconnects and timeouts never prove a writer stopped.

Error codes retain HTTP pairs: invalid_request 400/405/413/415, forbidden 403,
not_found 404, conflict/in_progress 409, unavailable 503, operation_failed 422.
Interrupted receipts use operation_in_doubt 409 without an invented outcome;
receipt-save failure after effects uses 503 and may retain its authorized compact
result. Errors never echo raw requests, capabilities, paths or command output.

Archive uses the normal persisted grace and no grant. Its phases distinguish
retained permission intent, frozen completion, reviewed deletion and completed
reap. A concrete administrative plan, raw nonrecoverable-byte review and exact
digest approval remain outside the socket protocol. Local reap retains complete
checkpoint/provenance and remote refs, removes only approved remaining entries
and exact member registrations, and retries quota retirement. No socket archive
response grants deletion approval.

The response corpus labels each case `validation: wire` or `validation: producer`.
Wire checks use the expected operation, request ID and observable request options.
Independent producer assertions such as `authorized_grant`, `verified_fence` and
complete `inventory_keys` live only in fixture context, never request/response JSON.
A wire client cannot independently prove a host fence or discover an omitted
registration from one response; producer-layer cases require separate authoritative
state/fencing evidence. Absence of that sideband knowledge does not reject a
structurally eligible grant. It also never grants runtime authority by itself.

A stop_admin recovery grant authorizes reconciliation only. An initialization
stopped with its continuation revoked cannot restart preparation or finish
initialization merely by presenting that token. Any local administrative repair
requires its own explicit reviewed authority; no socket repair operation is
defined here. An oversized-root stop_admin may still fence successfully while
omitting the optional grant/root; root bounds never disable stop.

## Conformance scope

The shared request, response and lifecycle corpora define data checks and runtime
obligations separately. Passing structural and lexical cases does not establish
producer fencing, consumer integration, reporter provisioning or deployment.
Those require product-owned lifecycle tests and explicit enablement gates.

## Proposed logical-capacity refusal diagnostic

This additive diagnostic remains PROPOSED. A verified logical quota reservation
refusal uses HTTP 422 and `error.code: "capacity_exhausted"`. The existing closed
error object retains only `code` and `message`; successful response shapes and
request bytes do not change. Other failures remain their existing codes.

The producer's bounded message is:

```text
logical reservation capacity exhausted; needed_bytes=N available_bytes=N needed_inodes=N available_inodes=N
```

Each `N` is a canonical nonnegative decimal uint64. Needed is the complete logical
reservation demand after the attempted allocation, including shared reservations,
retained bench caps and host reserve. Available is the filesystem's total logical
byte/inode budget, not physical free space. At least one needed quantity exceeds
its corresponding available quantity. Retired allocations count as zero. This
message exposes no policy paths, account IDs, raw helper output or capabilities.
The daemon logs the same code and bounded quantities.

This is a refusal, never permission to enlarge caps or reexecute a create. The
original creation intent and receipt remain retained; absent or ambiguous helper
output stays an ordinary failure. Operator reconciliation is separate.

The quota producer and strict response schema move first. A closed older v2 client
rejects this unfamiliar code, preserving its refusal behavior until explicitly
updated to recognize `capacity_exhausted` at HTTP 422. Consumers must not accept
arbitrary new codes or dispatch a new request after a failed decode. Shared
response vectors establish wire conformance only; they do not prove a real quota
refusal, XFS allocation cutoff or daemon receipt replay.
