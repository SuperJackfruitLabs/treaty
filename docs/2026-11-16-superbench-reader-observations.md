# SuperBench reader observations

**Status: PROPOSED. Not accepted, enabled or deployed.** This is a separate
plain-data reader contract, not an amendment of accepted v1 operation bytes,
grouped v2 operation bytes, cancellation, receipt recovery or the event catalogue.
The scoped reader ownership boundary remains proposed. No new issuer, audience,
reader credential, terminal/write grant or network proxy is implemented here.

SuperBench's Go service serves no route for these observations, and no other product reads them;
SuperBench's web codec is its own UI, not a crossing. So they are not part of
`superbench.local-api` in `contracts/registry.json` (phase 4, ruling 5). The schemas and fixtures
stay here, and the reader returns to the registry when the service implements it.

Canonical addresses:

- `schemas/superbench/observation-request.v1.json`
- `schemas/superbench/observation-response.v1.json`
- `fixtures/superbench-api/observations.json` (structural/semantic/lexical cases)
- `fixtures/superbench-api/observation-producer-scenarios.json` (unexecuted runtime obligations)

The test adapter validates shared data. It is not an authorizer, snapshot store,
filesystem reader, checkpoint-history producer or live consumer.

## Authority and transport prerequisites

The proposed local crossing is a separate POST `/v1/observations` on an explicitly
opted-in host-local Unix reader service, kernel peer authenticated. No existing
producer enables that route. Every request needs configured read authority for
its selected bench; content needs explicitly configured member/read-kind/path
policy in addition to inventory permission. Neither UID claims nor a snapshot
identifier/cursor authorize a read. Recheck current policy before publication,
including after asynchronous work. Denied and out-of-scope resources return the
same forbidden result before existence disclosure. Do not read/migrate an engine
database directly from a consumer.

Browser/network access requires an owner-approved Organization resource audience,
entitlement and client registration, plus SuperBench membership, scope, host
routing and session policy. This reader proposal does not define or provision
those authorities. Never borrow another product's token, expose a legacy Unix
socket through TCP or treat loopback as user authentication. Reader deployment
must preserve accepted lifecycle ownership and keep write authority separate.

## Envelope and limits

Requests use `version: "superbench.observation.v1"` and one of `inventory`,
`checkpoints`, `tree`, `file`, `diff`, `log`. All are reads: there is no growth
request ID, lease token, claimed UID/org/role, arbitrary root, revision expression,
command, administrative stop or attachment operation. Closed schemas reject
unknown fields. Decode at most 64 KiB, strict UTF-8/Unicode scalars, no duplicate
keys, nulls, trailing JSON, noninteger/negative/exponent numeric spellings or
integers above 2^53-1. Responses are bounded to 1 MiB before transmission; a
producer refuses unavailable rather than truncating JSON or page entries.

A success has `version`, exact `operation`, `ok: true`, `snapshot`, `observed_at`,
`expires_at`, `result`. Times are valid UTC RFC3339 (millisecond precision at most).
TTL is at most five minutes. `snapshot` is an opaque lowercase SHA-256 observation
identity, **not** a bearer capability or proof of quiescence. The producer binds
it privately to current authorization identity/policy, host/state lineage,
selected immutable bench IDs, core rows, and a content-view manifest with member
physical identities and authorized file/log bytes/metadata. Keep canonical
encoding/version private until a producer publishes its algorithm; clients never
recompute the ID or choose roots from it. A digest of mutable source state is not
an atomic writer fence; report detected changes, not a fictitious stopped writer.

Snapshot storage has an independently bounded capacity/TTL; refusal at capacity
must not expire a lease or delete core checkpoints/history/receipts. A cursor is
opaque, at most 256 ASCII characters and bound server-side to this snapshot,
operation, scope and page position. First inventory has neither cursor nor
snapshot; a continuation has both. Other reads identify the snapshot. All pages
must refer to the same authorized observed set and declare `complete`; paginated
results have `next_cursor` exactly when incomplete. At most 100 rows/entries per
page, and a smaller response may be required by the byte limit. No silent
scalar/aggregate filtering. Cursor expiry is not permission to continue against
a different snapshot or silently restart a timeline.

Failures have `ok: false` and only `error {code,message}` plus optional parsed
operation. They carry no content, snapshot/grant or raw request. Generic messages
never include paths, URLs, credentials or private backing errors. HTTP mapping:
invalid_request 400, forbidden 403, not_found 404, stale_snapshot 409,
content_unavailable 409, snapshot_expired 410, unavailable 503. Malformed input
has no trusted operation. Authorization precedes resource existence reporting.

## Inventory and checkpoint history

Inventory items are ordered by key, uniquely identify `key` plus immutable
`bench_id`, and disclose only `kind`, `phase`, `availability`, logical ordered
`member_names`, `pending_checkpoint`, `history`, optional `checkpoint` and
`transfer_state`, plus a server-owned logical `host {id,label}`, `storage`, and
optional current `holder`. Host IDs/labels are configured display/routing
identities, not raw machine IDs, DNS names or filesystem roots. `storage` has
`used`, `quota` and `allocated` byte observations, each `{status: available, bytes}`
or `{status: unavailable}`; unavailable must never be substituted with zero.
Each available observation is a safe nonnegative integer. These are observed
measurements, not reserved free space or capacity promises. `holder` has logical
`name`, `source` (local/run/agent/unknown), untrusted `display`, optional `run` and
`agent` identifiers. Held availability requires a holder; unleased has none.
A run/agent source requires its corresponding logical identifier; use local or
unknown when that association is not available. The display is not proof that the principal exists or a process is alive, nor
does it grant authority. No repository URLs, physical/local/log paths, holder token,
private continuation, argv, environment, allocation internals or raw manifest.
A `reclaiming` or `reclaimed` workspace is released and never acquirable, so its
availability is blocked. A ready phase with relinquishing/transferred state is blocked, as are incomplete
initialization/pending/archived records. `unleased` is an observation rather than
permission to write, and a held lease says nothing about process liveness.

A scalar checkpoint has a logical evidence `id` and confirmed `commit`. A grouped
checkpoint has `id`, `generation`, `seal`, `manifest_sha256`, logical
`checkpoint_repository`, and complete ordered `members {name,branch,object_format,commit}`
(maximum 32). Names are unique; commit and coordinator seal widths match object
format. All values come from producer-confirmed evidence, never current unpushed
HEADs. Pending work is a distinct flag; it cannot be substituted as confirmed.

`checkpoints` binds key plus bench ID and returns newest retained confirmed events
first. `coverage` is `retained`, `latest_only` or `unavailable`. A producer storing
only the latest checkpoint emits at most one item, complete, with `latest_only`.
An unavailable history emits no items. A retained page is not a claim of complete
lifetime history: retention can leave earlier events unavailable. Each record's
`time_source` is `recorded` with a genuine `confirmed_at`, or `unavailable` with no
invented timestamp. Observation time is never checkpoint creation time. Do not
construct service-confirmed history from Git reflogs, remote enumeration or UI
sample events. Duplicate evidence IDs within a snapshot are invalid.

## Files, diffs and captured logs

Content requests bind snapshot/key/bench ID plus registered logical member (a
workspace requires it; scalar reads omit it). Paths are exact Unicode scalar
member-relative names, at most 1024 UTF-8 bytes. Root listing alone uses empty
path. Reject absolute/drive/backslash/control/NUL, empty/dot/parent components and
case-insensitive `.git` control components. Do not URL-decode a path or expand
pathspecs/revisions. Do not disclose symlink targets; tree can show a symlink as
unreadable, never follow it. Directory entry names are single components.

A producer must verify registered physical root/common mirror identities and use
bounded non-following descriptor-relative reads, rejecting replaced parents,
symlinks/special files or stale/reused roots. Bind source identity/size and bytes
before and after reading. A changed backing file returns stale_snapshot without
partial success. Do not mutate Git/index/config/cache, refresh status metadata,
run hooks/external diff helpers, acquire leases, migrate, or create/delete source
files during reads. Generic schema validation does not prove these filesystem
properties. File content (including ignored/untracked content) is default-denied
unless explicitly authorized by content policy; this is not a secret-free claim.

`file` returns requested offset, total snapshot bytes, `data_base64`, SHA-256 of
the exact decoded chunk, and whether the range reached EOF. `diff` uses an
explicit checkpoint evidence ID from this snapshot as its base; the producer
resolves exact member commits internally, never arbitrary refs. It returns
bounded literal diff bytes with chunk digest/cursor and no executable commands.
Each chunk is at most 64 KiB decoded; canonical base64 and hash must match. Do not
truncate hidden bytes without an explicit next page/range. Binary data can be
represented but must never be executed or treated as HTML.

`log` selects an actual retained run ID, not a path. It distinguishes `sealed`,
`interrupted`, `unsealed`, `collected`, `absent` capture with `known`/`unknown`
outcome, observed bytes, range and `capture_complete`. Unsealed/interrupted or
absent capture has unknown outcome and never complete capture. EOF of the
observed range (`complete`) is separate from completeness of the original capture.
Absent/collected records carry no bytes/hash; do not synthesize an empty file,
known exit or successful history. A sealed capture may still be truncated; its
`capture_complete` is false. Reads confer no collection, reconciliation, release
or writer-stopped authority. Active logs are point-in-time reads subject to the
same race refusal, not terminal attachment or a streaming protocol.

Render all names/diffs/logs/task output as untrusted text; never execute scripts,
HTML, terminal control sequences or auto-navigate child-supplied links. Content
can legitimately contain secrets/URLs; the product's content policy, not a
claimed universal string sanitizer, controls whether it is readable.

## Producer and consumer gates

The obligation corpus covers current authorization/revocation, complete mixed
inventory, latest-only/pruned history, reused IDs, descriptor/symlink races,
private content, actual byte bounds, log ambiguity/collection, expiry and
attachment separation. These are explicitly **unexecuted** here. A later producer
must implement and prove them with real files and actual authenticated transports.
The observation is an allowlisted projection, never a forwarding of private
engine or operation records. A schema cannot create confirmed history that the
producer has not retained.

The disabled SuperBench viewmodel will consume a pinned copy of this exact corpus
and reject incompatible fixtures. Its render/layout proof remains separate from
wire conformance and authenticated live integration. Files/diff/log implementations,
terminal read/write contract, network auth, remaining suite consumers and actual
integration verification remain separate implementation obligations. Inventory
alone does not implement the full reader or attachment boundary.
