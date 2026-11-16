# SuperBench consumer bindings

**PROPOSED. Not accepted, provisioned or enabled.** These plain-data contracts
extend the [reader proposal](2026-11-16-superbench-reader-observations.md) with
consumer bindings. They do not duplicate its inventory, checkpoint history,
files, diffs or logs. The accepted coordinator design does not accept these
additional crossings. No listener, adapter, grant, audience or terminal is added.

Schemas live in `schemas/superbench-consumers/`; shared structural cases and
unexecuted producer obligations live in `fixtures/superbench-consumers/`.
The script adapter checks data joins only, not authorization or runtime ownership.
Existing v1/v2 operation bytes and the accepted event catalog stay unchanged.

Each record is at most 64 KiB of strict UTF-8 JSON, with no duplicate keys,
unknown fields, nulls, trailing JSON, non-scalar Unicode, negative/fractional/exponent
numbers or integers above 2^53-1. Apply lexical and closed-schema checks before
semantic joins. Bench key, immutable bench ID, host ID and checkpoint ID retain
the existing reader grammar; these records do not define alternative identities.

## Card panel

`card-binding.v1.json` is a SuperPipeline-owned association, not a SuperBench
request. A server-authorized current tenant/board/card and optional current run select an immutable
bench key plus bench ID and logical host. Join these fields against
that authoritative association and the actual authorized reader inventory item.
Run presence must match exactly, including a card with no active run. A reused key
or changed run/host must refuse the join. Reader snapshots are transient observation
metadata, never stored association identity: an authorized fresh snapshot for the
same key and bench ID refreshes the panel without rebinding the card. Stale, denied
or missing observations remain unavailable. Rendering uses
the existing reader's logical host, available/unavailable storage measurements,
last confirmed checkpoint and holder fields. Unknown never becomes zero or an
invented label. All labels are untrusted text. A panel does not grant attachment,
write access or lease takeover. Reader freshness and scope checks still apply.

## Locality

`locality.v1.json` is a SuperBench-owned retained-presence observation with logical
host, immutable bench and an actual confirmed checkpoint ID, or explicit
unavailable state with no checkpoint. Its snapshot refers to the same authorized
reader observation. Times are UTC Unix milliseconds, safe integers. Expiry must
be later than observation time by at most five minutes; before observation time,
at/after expiry or upon any source mismatch the observation is neutral.

An authorized consumer joins host IDs through current AgentPod registry and tenant
mapping, never by display label or raw hostname. Only already eligible candidates
can use a fresh exact checkpoint match. Proposed ranking is stage record, locality,
success rate, least-recent dispatch, then existing stable ties. Hard eligibility,
required host affinity, writer uncertainty and source admission remain mandatory.
A warm observation is not a lease, readiness proof, available disk reservation,
checkpoint fence or permission to move work. Missing locality never blocks ordinary
pull or standalone use.

## Lifecycle evidence

`lifecycle.v1.json` defines proposed event **data**, not a second event envelope.
A future accepted CloudEvents binding would use the existing envelope and types
`com.superjackfruit.superbench.bench.<kind>.v1`, where kind is created, leased,
checkpointed, recovered or archived; version belongs in type/dataschema, not
subject. These types are deliberately absent from the accepted catalog.

SuperBench must persist event ID and increasing sequence in the same successful
lifecycle transaction. Sequence is scoped to stream ID plus immutable bench ID;
stream IDs cannot be recycled after state replacement. A checkpointed event must
reference genuine confirmed evidence; other kinds omit that field. Recorded time
is producer time, not an observation timestamp substituted for missing history.
No event declares that a writer is fenced or grants ownership. A lease event does
not assert that its holder process is alive. No paths, repository URLs, tokens,
continuations, commands, environments or inferred work-run identities are fields.

SuperWitness can cache source evidence, deduplicate identical IDs, refuse conflicting
reuse and present out-of-order records by sequence. Gaps and collected history stay
explicit; it must not fabricate missing transitions. Replay keys include stream,
bench ID and event ID, with sequence uniqueness in that stream/bench. Exact retries
retain the original bytes; changed bytes or sequence reuse conflict. An external
work-run join is a separately authorized SuperPipeline-owned association with its
origin namespace, not a lease display or trace ID interpreted as a run.

## Deployment and evidence gates

A future event transport must use its own approved resource audience, membership,
scopes, issuer/client registration and current authorization, or an explicitly
configured host-local reader. No legacy Unix-over-TCP proxy or borrowed product token.
Data fixtures cannot establish those facts. Producers must prove atomic success-only
events, restart/replay identity, current authorization, honest retention, key reuse,
redaction and bounded reads before consumers enable anything. The shared corpus
proves structural/join checks only; runtime obligations are marked unexecuted.

Read-only inventory is an incremental surface. Full file/diff/log views, genuine
retained history and AgentPod live terminal attachment remain separate work; attachment
and writes require the existing runtime and lease authorities.
