# Optional private registered-worker capsule

**PROPOSED. Not accepted, provisioned or enabled.** This is an AgentPod-owned
local task-data boundary for its packaged worker, separate from public reader,
card, locality and lifecycle-event projections. It changes no existing worker
mode, SuperBench operation, CloudEvent catalog, grant or transport listener.

The coordinator design is accepted with five conditions: dependency direction is
suite to SuperBench; SuperBench enforces lifecycle guarantees itself; suite-shaped
surfaces remain optional; standalone lifecycle and privileged paths need real
proof; disabled suite flags preserve ordinary behavior. This proposal preserves
those conditions and does not enable a new crossing by citing that acceptance.

## Owners and unresolved producer work

AgentPod packages the capsule and its packaged worker decodes it. SuperBench must
never import/encode this schema, interpret its board/card/run fields, call a suite
service or special-case the packaged worker. Any future SuperBench payload I/O
must be a separate generic finite-byte transport over operator-selected argv,
useful standalone. No such transport is specified or proved by this document.

SuperBench and its fixed helper independently verify their own current operation,
registered layout, payload identity and execution scope before effects. They own
actual fencing, checkpoint/seal, whole-vector remote confirmation and release.
No capsule field, hash, worker result or caller assertion supplies that authority.
There is deliberately no caller `scope`, `admitted`, `fenced` or credential field.

Before building a capsule, an enabled coordinator would need authenticated,
product-neutral private evidence of the current registered layout bound to its
original retained source/operation. That acquisition and the generic producer
transport remain unresolved producer prerequisites. Public viewer snapshots,
logical labels and child-supplied physical tuples cannot replace them.

## Input and result frames

The packaged worker mode is `registered-v1 <capsule_sha256>`, with exactly one
lowercase 64-hex SHA-256 of the canonical body bytes, excluding the frame header.
The selected executable/release and operation admission are independently pinned;
knowing this digest grants no execution opportunity.

Input is BE32 unsigned body length, 1–65,536 bytes, followed by exactly that many
UTF-8 JSON bytes and EOF. No second frame, extra byte or trailing newline. The
worker accepts a finite regular input FD or pipe, not a path supplied in the
capsule. A pipe must finish body and EOF within five seconds or an earlier request
deadline. The producer owns the finite descriptor and the only launch opportunity.
This schema adapter tests captured bytes, not an OS pipe, deadline or admission.

Worker stdout contains exactly one separately bounded BE32 result frame. Harness
logs use another channel and must never be mixed into the result. Harness output
is parsed as task data before the worker emits its canonical result. A missing,
truncated, oversized, foreign-binding or mixed result leaves the original attempt
uncertain; it is not permission to resend input or launch again. Only the producer
can reconcile its retained attempt. Digest equality alone is not replay protection.

## Capsule fields

`schemas/agentpod-local/registered-worker-capsule.v1.json` closes every object:

- `version`: `agentpod.registered-worker.v1`.
- `task`: the existing grouped worker data, version `agentpod.superbench-worker.v2`.
  It contains exact board/card/run/positive safe-integer epoch binding, bench key
  and immutable bench ID, expected physical workspace root, optional selected
  repository name, complete source members, arguments, prompt, environment and
  timeout. Members (1–32) are strictly name-ordered and have unique repository
  SHA-256 identities. Each task ref is exactly `refs/heads/card/<card_id>`; SHA-1
  commits are 40 lowercase hex, SHA-256 commits 64. Selection must name a member.
- `layout`: key and bench ID exactly matching the task; version
  `superbench.payload-layout.v1`; policy digest; physical root, root-home and
  root-temp nodes; complete members matching task names and order, each with
  checkout, admin, home and temp nodes. Every node is unique and on the root
  device. Device and inode are canonical positive decimal **strings** within
  uint64, so a JSON intermediary cannot round them through floating point.

The expected workspace root is an absolute clean path, at most 4,096 UTF-8 bytes,
under a `benches` parent with basename equal to the bench key. This describes the
already registered payload; it never instructs a producer to create, adopt, chown
or redirect a tree. Root/member paths are independently derived and checked at
runtime with current physical identities and payload ownership. The whole source
vector must pass actual Git/ref/origin/object-format/cleanliness checks before
the harness; schema and digest validation do not perform those checks.

Arguments number 1–128, each at most 8,192 UTF-8 bytes, without NUL; the first is
absolute. Timeout is 1–3,600 seconds. The non-null environment map permits only
`PATH`, `LANG`, `LC_ALL`, `TZ`, `TERM`, with no NUL/CR/LF in values. No reporting,
board, heartbeat, lease or continuation credential is a field. Prompt, arguments,
environment values and handoff are still untrusted task text, not a universal
secret-free claim. Never expose this private record to public readers or logs.

## Result and canonical bytes

`schemas/agentpod-local/registered-worker-result.v2.json` retains version
`agentpod.superbench-worker.v2`, exact original valid task `binding`, `outcome`
complete/blocked/failed and non-null string-map `handoff`. Handoff is untrusted
output; render as text and never interpret it as lifecycle proof or a grant.
A complete task result does not mean stopped writer, confirmed checkpoint,
released ownership or completed board stage.

Bodies must exactly match Go `encoding/json.Marshal` of these existing typed
records, with no whitespace/newline or unknown, duplicate, null or omitted required
fields. This is **not** the checkpoint owner's sorted-ASCII canonical algorithm:

- Struct fields follow their declaration order, as shown by the schema properties
  and shared golden bodies. Optional `repository_name` is omitted when empty;
  an explicitly empty value is not an alternative encoding.
- Environment and handoff map keys sort by UTF-8 byte order. Integer fields use
  their ordinary decimal representation. Arrays preserve order.
- Strings use JSON quote/backslash and control escapes; `<`, `>` and `&` become
  lowercase `\u003c`, `\u003e`, `\u0026`; U+2028/U+2029 are escaped. Other Unicode
  scalars remain UTF-8. Unpaired surrogates and invalid UTF-8 refuse.
- SHA-256 covers the exact body, not a re-encoded unknown record or the BE32 header.
  Validate closed schema and semantic joins before using a typed encoder; never
  erase unknown authority fields through projection and then accept the result.

The shared adapter checks byte spelling, bounds, fields, joins, uint64 preservation,
framing and expected digest/binding. It is not a worker, filesystem reader,
authorizer, supervisor or proof verifier. The corpus is an independent proposed
reference; the actual producer does not yet consume it. Producer/corpus agreement
and the listed real integration obligations remain unexecuted.

## Rollout

Publish schema/corpus beside existing modes; do not change ordinary dispatch or
select this mode implicitly. Prove private layout acquisition, generic finite I/O,
original-operation admission, failure/cancellation, complete producer-to-worker
execution and independent fence/checkpoint/release before enablement. Unknown
outcomes retain the original identity and never authorize automatic redispatch.
No writer isolation, cryptographic attestation, grant provisioning, network proxy
or live integration is claimed by this proposed record.
