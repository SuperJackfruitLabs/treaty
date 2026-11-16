# Private registration observation and finite execution IO

**PROPOSED. Not accepted, provisioned or enabled.** These are product-neutral,
operator-only additions beside the existing host-local v2 contracts. Existing v1,
unprofiled v2 requests, response bytes, defaults and limits remain unchanged.
They add no listener, credential, execution scope or grant configuration.
This proposal depends on the separately proposed workspace v2 logical-capacity
refusal extension, including its exact `capacity_exhausted` HTTP 422 mapping.

SuperBench executes operator-selected argv and treats input and stdout as opaque
bytes. It never imports a suite task schema, constructs a worker capsule, parses
board/run identities or interprets a worker outcome. A consumer-owned frame is
part of the opaque bytes, including its length prefix. This is separate from the
[proposed registered-worker data boundary](2026-11-16-registered-worker-capsule.md).

## Explicit finite IO profile

POST the existing `/v2/operations` with Content-Type
`application/json; profile=superbench.finite-io.v1`. Quoting the profile parameter
is equivalent. Unknown, duplicate or additional profile parameters refuse. The
profile selects bounded transport only; it supplies no authority. A profiled run
requires exactly one additional `io` object, and an `io` object requires this
profile. The read-only receipt lookup described below is the sole other operation
that may select this profile; all other operations refuse it. Unknown IO versions refuse.

```json
{
  "version": "superbench.finite-io.v1",
  "stdin_base64": "AAEC",
  "stdout_limit_bytes": 131072
}
```

The run request retains every existing required/optional field and ownership,
member-selection and preparation rule. `stdin_base64` is canonical standard
padded base64, including the empty string for empty input, decoding to at most
128 KiB. No URL-safe alphabet, whitespace, missing padding or nonzero unused pad
bits is accepted. `stdout_limit_bytes` is an integer from 1 through 128 KiB. These
limits do not widen any fixed helper policy. No path or descriptor number selects
an input/output source. In particular, no caller `scope`, UID, credential,
`admitted`, `ready` or `fenced` field exists.

The producer copies the validated finite input before launch. Input is delivered
only to the payload, followed by EOF; setup and other helper commands do not
inherit it. The body IO version, exact canonical base64 and output limit enter
the typed immutable request digest, in the new final `io` field. The IO object's
field order is `version`, `stdin_base64`, `stdout_limit_bytes`. Requests without IO
omit the field entirely and preserve their existing canonical encoding/digest.

Profiled request bodies, responses and each retained response are bounded to
256 KiB of actual UTF-8 encoded JSON. No-profile requests and growth receipts keep
their 64 KiB bounds; ordinary status keeps its existing separate transport bound.
The larger receipt reservation must be charged before effects against the same
bounded unresolved-response budget. Reject inability to reserve before launch;
never borrow capacity, prune history or silently truncate a response. All existing
field, raw-byte, depth, scalar, duplicate-key and operation-shape guards remain.

## Exact stdout observation

Only after actual execution fencing, complete output drain and successful capture
seal may a run result contain:

```json
{
  "version": "superbench.finite-io.v1",
  "stdout_base64": "AAEC",
  "stdout_bytes": 3,
  "stdout_sha256": "ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc"
}
```

The producer computes the byte count and lowercase SHA-256 over the exact decoded
stdout. The count must equal the bytes and not exceed the request limit. Stdout
is independently captured; stderr and execution logs are not mixed into it.
Zero bytes is an exact empty observation, not missing or unavailable output.
The execution must be stopped with a known exit code. A nonzero child exit can
still have exact sealed stdout; that does not turn the task into success.

A successful profiled response requires this IO result. Overflow, truncation,
read/write failure, uncertain process state or incomplete fence/drain/seal cannot
produce successful IO or a partial `stdout_base64`. In-progress, unavailable and
in-doubt responses have no IO result. Preserve private original evidence and the
original identity for reconciliation. A wire `stopped` label, digest or parseable
stdout cannot independently prove that the producer performed these lifecycle
checks. Worker success never proves remote checkpoint confirmation or release.

## Retained response recovery

Original UID, request ID and exact typed body digest retain their existing replay
meaning. Exact completed replay returns the original HTTP status and bytes without
launching again; conflicting IO bytes or limits refuse under the same request ID.
A timeout, disconnect, missing result, invalid result or lost reply never permits
a fresh request ID, setup replay, payload resend or automatic redispatch.

The existing read-only receipt lookup may use the same explicit profile. Its
request and target semantics remain unchanged. Only this profile permits an exact
original response body up to 256 KiB inside an outer envelope up to 2 MiB. The
unprofiled lookup keeps its 64 KiB body/512 KiB envelope bounds and reports
unavailable for a larger retained response, without truncation. A lookup remains
read-only and currently operator-authorized; absent or ambiguous history parks.
Historical output or capabilities cannot restore current ownership. No original
operation body is resent as a recovery mechanism.

## Private grouped registration observation

The separate optional POST `/v2/registrations/observe` has the normal v2 envelope
and `operation: registration_observe`. Its request contains exactly `version`,
`operation`, `key`, immutable `bench_id`, `holder` and `lease_token`. It has no
request ID or effects. Both request and complete response are at most 64 KiB.
Only an actual authorized Unix operator with the exact currently held owner may
observe; reader-only peers and wrong/missing capabilities refuse before disclosure.

The private success result contains exact `key`, `bench_id`, derived `root_path`,
`layout_version: superbench.payload-layout.v1`, `policy_sha256`, physical `root`,
`root_home`, `root_tmp`, the complete name-sorted `members` vector, and the original
`checkpoint` identity. Each member has `name`, `checkout`, `admin`, `home`, `tmp`.
Physical nodes contain canonical positive decimal uint64 **strings** `device` and
`inode`; all nodes are distinct and on the root device. Checkpoint contains
`generation_id`, `seal`, `manifest_sha256`, and the same ordered member names with
exact committed object IDs. The absolute clean root path is at most 4,096 UTF-8
bytes. The complete response must fit; never return only a prefix of the vector.

This first proposal is aggregate-only. It cannot invent scalar layout nodes or
replace a missing registration with observed directories. The producer validates
its own fixed policy and registered physical topology through its actual
restricted inspection boundary, holds the existing ownership exclusion, and
rechecks the same owner, immutable registration and checkpoint after awaits before
returning. Stored metadata or a public status response alone is insufficient.
The inspection helper receives no lease token, SQL authority, argv or execution
scope and performs no Git, process, quota or filesystem mutation.

The response has no token, grant, ready/fenced flag or new authority. Its paths and
physical tuples are private task preparation data, never public card, locality,
event or reader projections. Consumers preserve the exact observation and verify
its original binding; knowledge of these values does not authorize execution.

## Conformance and enablement

Schemas and shared vectors specify byte spelling, bounds, shapes, joins and digest
behavior only. Producer scenarios separately require copied finite input and EOF,
no setup inheritance, real registered-layout inspection, owner changes after
awaits, scope fencing, independent drain, overflow, seal failure, loss/restart,
exact receipt replay and no redispatch. These runtime obligations remain
unexecuted by the schema adapter. Producer and consumer tests must consume the
same owner vectors before enabling a crossing. This proposal changes no accepted
coordinator condition and makes no hostile-command or cryptographic attestation
claim. Standalone lifecycle protection remains the producer's responsibility.
