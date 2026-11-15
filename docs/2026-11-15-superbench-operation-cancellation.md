# SuperBench operation-bound cancellation v2

**Proposed. Not accepted or enabled.** This extension follows charter's proposed
[cancellation decision](https://github.com/SuperJackfruitLabs/charter/blob/main/decisions/2026-11-15-cancellation-binds-a-source-operation.md).
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
bodies, plain canonical JSON strings and SHA256 goldens generated with producer
`63b1e66187cd72c0151b341912bf29f6a6cd2268`, using its actual
`internal/protocolv2.Parse`, `json.Marshal(Request)` and `Request.Digest`.
The generator ran in an isolated temporary Go module with a read-only local source
reference. These are public fixture values; the held token is synthetic.

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
