# SuperBench workspace operation requests v2

Status: proposed request contract for aggregate benches. This is not an
implementation, response-schema, deployment or consumer-conformance claim.
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
