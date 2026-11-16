# SuperBench operation-bound cancellation v2

**Proposed. Not accepted or enabled.** This extension follows the proposed
host-local cancellation ownership boundary.
The accepted local v1 boundary and existing v1/v2 canonical bytes remain unchanged.
Shared fixtures describe verification obligations, not producer execution,
consumer conformance, a provisioned grant or a live pilot.

## Explicit extension and target

The proposed host-local Unix endpoint remains POST `/v2/operations`. An explicitly
supporting implementation accepts the union of `operation.v2.json` and the separate
`cancel-operation.v2.json`; the existing operation schema does not silently widen.
Unsupported producers refuse the extension. Clients never fall back to v1,
administrative stop, another host or redispatch.

A cancellation has exactly `version: "superbench.v2"`, `operation: "cancel"`,
`target_request_id` (the original growth request ID), and `target_digest` (64 lower
hex SHA256 characters). It has no workspace key, caller-asserted UID, holder,
lease token or new cancellation request ID. The authenticated Unix peer supplies
the UID namespace. These bytes do not authorize a new identity or a stop by key.
The target is the original create, recover, lease, run or setup operation, including
pre-grant preparation. Ordinary requests without a durable growth request ID
cannot become cancellation targets by inventing an ID.

Requests and cancellation replies are limited to 64 KiB of raw bytes. Decoders
reject invalid UTF8, unpaired Unicode surrogates, duplicate keys (including escaped
equivalent names), excessive nesting, trailing documents and unknown fields.
Response error messages use the existing 256 UTF8-byte bound and closed error-code
set. Go and Swift consume the schemas and fixture data directly; the TypeScript
adapters in `scripts/` are test helpers, never required runtime imports.

## Cap-free observations

`cancel-response.v2.json` requires `version`, `operation: "cancel"` and `ok`.
Success requires `result` with exactly the original `target_request_id`, original
`target_digest`, and `state`. Semantic validation must compare both echoes to the
submitted target before trusting any observation. Success uses HTTP 200; existing
errors map to 400 `invalid_request`, 403 `forbidden`, 404 `not_found`, 409 `conflict`,
`in_progress` or `operation_in_doubt`, 422 `operation_failed`, 503 `unavailable`.
`operation_in_doubt` also permits 503; opaque pre-parse `invalid_request` errors
can use 405, 413 or 415 as in the existing envelope. A failure requires `error`; it may omit `result` rather than fabricate a state.
Any supplied failure result has the same strict shape and exact target binding.
Pre-parse failures remain the existing opaque error envelope, not a trusted
cancellation observation.

| State               | Required producer meaning                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cancel_requested`  | Cancellation intent is durable. Exact-operation reconciliation or fencing remains pending. No fence or safe handoff is implied.                                   |
| `cancelled`         | The producer independently proved either no effect was admitted, or every scope belonging to that exact operation is stopped/sealed and its continuation revoked. |
| `already_completed` | Durable completion won the race. Preserve and replay the exact historical source receipt; no new operation is launched.                                           |

Replies contain no grants, tokens, root paths, process handles or claimed UID.
Matching target hashes and schema-valid `cancelled` bytes are not independent
fencing evidence. The `producer_only` fixture is deliberately wire-valid while
its missing exact-operation proof must make producer finalization refuse it.
Timeout, socket close, acknowledgement and elapsed time never establish fencing.

## Exact source digest

`fixtures/superbench-api/source-digests.json` records original accepted source
bodies, canonical JSON strings and SHA256 goldens for the producer-owned typed
source encoding. Fixture capabilities are synthetic and carry no authority.

This algorithm is **not RFC8785** and does not hash the original wire bytes.
Parse and validate the complete original request first, normalize its exact
integral quota spelling, marshal the producer's typed request without a trailing
newline, then SHA256 those UTF8 bytes. Go's typed field order is:

```text
version, operation, key, repositories, checkpoint_repository, source, holder,
request_id, lease_token, arguments, checkpoint, initialize, offline,
repository_name, quota_bytes
```

Repository fields are `name, repository, branch, base`; recovery source fields are
`repository, bench_id, commit, manifest_sha256`. Apply Go's `omitempty` rules:
omit absent/empty optional strings and slices and nil pointers; preserve a present
pointer to `false`. Quota is marshaled as its normalized unsigned decimal integer.
Go JSON escaping includes `\u003c`, `\u003e`, `\u0026`, `\u2028` and `\u2029`;
valid other Unicode scalar text is UTF8, with ordinary JSON control escaping.
Object key order and insignificant wire whitespace therefore do not affect the
digest. Equivalent accepted `1024` and `1.024e3` quota spellings share a digest;
false versus omission, an argument or held-token change do not. The recovery
golden starts with reordered nested source keys and verifies the same canonical
bytes when read in typed source-field order. Canonical bytes
include capability-bearing source fields when present, but cancellation transmits
only their digest. Never log original capability-bearing bodies to explain a
mismatch. A digest is source binding, never proof that the source was authorized,
fenced, completed or received by its original client.

## Runtime obligations and migration

`cancellation-lifecycle.json` lists required actual producer drills. Admission
persists intent independently of workspace locks and ordinary operation slots.
Original claim and bounded pre-admission tombstone decide atomically for the same
peer UID, request ID and digest. Existing admitted targets remain cancellable
when normal slots or the unknown-target tombstone budget is full; refusing an
unknown target at capacity says nothing about cancellation.

Bind a fresh operation epoch before planning/allocation, then atomically bind
workspace and lease authority. Serialize each effect initiation with the durable
cancel barrier, including Git/backend launch, captures, filesystem changes and
publication. A short admission gate must not wait for workspace flock or running
Git. Finalization is the durable race cutoff: a winning barrier forbids a fresh
grant and later effects; a completed receipt remains exact historical evidence.

Restart reconciles rather than redispatching payloads, hooks, creation or pushes.
Partial files and remote publication remain preserved. Stop reconciliation must
compare exact operation, workspace, epoch and recorded authority within the stop
gate, leaving replacement owners, reused keys and later same-token work untouched.
Cancellation does not release, acquire, rollback, checkpoint, retire quota or
remove receipts/journals. Unknown provenance or unfenced descendants remain
pending or `operation_in_doubt`.

Merge and enable producer support before consumers opt into the extension, with
explicit accepted-contract review and real managed descendant/restart, SQL fault,
full-budget, cross-UID/digest, completion-race and later-owner drills. Shared data
and local schema tests alone do not satisfy those gates. No TCP proxy, cross-host
fence, external writer registration, AgentPod dispatch or board mutation is added
here.

## Proposed read-only receipt recovery amendment

**Proposed; not accepted or enabled.** This additive amendment uses the existing
SuperBench lifecycle owner and authenticated host-local crossing. It does not
change the accepted v1 protocol, existing v2 operation/cancellation schema bytes,
reporter grants, or the cancellation decision's fencing requirements.

A client that lost a source reply must not resend its source operation merely
because it has a cancellation ACK. An ACK can authorize historical lookup only
within the same durable receipt-state lineage; a reused socket path does not
prove that the database was retained or not rolled back. A dedicated read avoids
executing the source body even when that lineage cannot be established.

`POST /v2/receipts/lookup` accepts the separate
`schemas/superbench/receipt-lookup-operation.v2.json` shape: exactly `version:
"superbench.v2"`, `operation: "receipt_lookup"`, `target_request_id` and
`target_digest`. The ID and digest use the existing cancellation target grammar
and typed source-request digest. Kernel peer credentials supply the UID. The
request requires current configured operator authority for that peer UID. A readers-only or demoted peer receives forbidden before receipt lookup, without revealing existence; another operator UID still cannot read the original owner’s receipt. Historical capability disclosure requires operation authority even though this endpoint has no effects. The request has no claimed UID, source body, key, holder, lease token or fresh request
ID. It is not a growth operation and never calls receipt claim, execution,
acquisition, setup, allocation, Git, capture creation, helpers or publication.

Successful HTTP 200 replies use the separate
`receipt-lookup-response.v2.json` schema and echo the exact target. `completed`
contains `http_status` and `response_body`: the original stored HTTP status and
**exact UTF8 response bytes**, represented as a JSON string without reparsing or
reserializing its contents. `absent`, `in_progress`, `operation_in_doubt` and
`cancel_requested` contain no body, status or grant. A cancellation barrier may
be reported conservatively as `cancel_requested`; this read never upgrades it to
independent fencing proof. Wrong digest for an existing same-UID target conflicts.
Another UID cannot read the original owner's receipt. No result claims present
ownership, ready state, checkpoint/release success, or receipt-state lineage.

The raw request limit remains 64 KiB. An original `response_body` is at most
64 KiB of UTF8 bytes; the whole lookup response is at most 512 KiB, below the
existing 1 MiB transport ceiling even when JSON string escaping expands stored
bytes. Error messages are at most 256 UTF8 bytes. All objects are closed; null,
duplicate fields, trailing documents, invalid UTF8, non-scalar Unicode, floats,
unsafe integers and excessive nesting are refused. Completed replies preserve
original failure receipts as well as success receipts. An oversized or invalid-UTF8 stored body returns unavailable without truncation or source replay. Consumers independently
validate those private bytes against their exact saved original request.

Receipt reads have **two active read slots per service**, independent of all 64
normal operation slots and growth receipt capacity. Excess reads refuse with
`unavailable` rather than queue unbounded work. Reads do not consume cancellation
admission; authenticated cancellation remains available when both read slots are
occupied. With the existing eight classification/cancellation slots and 64 normal slots, the explicit accepted-connection ceiling becomes 74 rather than 72; no unbounded queue is introduced. Request classification and body sizes remain bounded. The lookup joins
the existing serialized receipt decision only for its read, without mutating or
reserving an identity. A fresh/replaced database returning `absent` must produce
zero claim, tombstone, intent, core, workspace or history growth, including when
the caller retains a valid ACK from the old database.

AgentPod keeps the original request/reply, exact ACK exchange and any lookup
exchange as separate private evidence. Lookup never overwrites an original
error or `operation_in_doubt` response. Missing, malformed, unknown, interrupted
or absent evidence remains parked. A recovered historical grant supports only
separately authorized exact-original-token cleanup; it cannot renew a
continuation, authorize payload launch, acquire/release a lease, establish
readiness or clear the durable cancellation veto. No original-body automatic
replay, protocol fallback, administrative/key-only stop or another-host retry is
introduced. Private receipt bodies and capabilities never enter ordinary Hub or
board results or logs.

The plain-data corpus is `fixtures/superbench-api/receipt-lookup.json`.
`receipt-lookup-lifecycle.json` separately records required producer checks for
kernel UID/digest binding, exact bytes/status, restart, replaced database,
saturated operation/read admission and historical-token limits. Passing schema
fixtures does not establish those producer checks, consumer acceptance, grant
provisioning, deployment or a live pilot. Both service and consumer integration
remain explicitly disabled until their owner-reviewed implementation and
conformance gates are satisfied.
