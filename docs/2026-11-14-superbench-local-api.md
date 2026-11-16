# SuperBench local API v1

Status: the host-local ownership and wire boundary was accepted in charter
#37/#38 and treaty #29. This contract is not evidence that suite adapters are
deployed. The proposed [checkpoint-generation extension](2026-11-15-superbench-checkpoint-generations.md)
adds multi-repository evidence beside v1; it does not replace these operations.

The canonical request is `schemas/superbench/operation.v1.json`; shared positive,
negative and lexical-decoder vectors are `fixtures/superbench-api/operations.json`.
They are plain data, not CloudEvents and not additions to the event catalogue.
Go consumers pin copies with source revision/hashes and run the same vectors;
Node's schema test covers structural vectors, while duplicate-key and
trailing-document rejection belongs to the decoder.

## Transport and authority

POST `/v1/operations` over a host-local Unix socket, JSON, at most 64 KiB. The
server authenticates the Unix peer uid from the kernel. Operator uids can mutate;
reader uids may use status/host_status only. Header/body uid, role or admin claims
confer no authority. Unknown request fields, duplicate object keys, trailing JSON,
unknown versions, null optional values and operation-inappropriate fields fail.
Readers ignore new response fields. Response `version` is `superbench.v1`.

`create`, `recover`, `lease`, `run` and `setup` require a caller-chosen request_id.
Reusing it with another body is a conflict. A completed receipt may be replayed
only to the same Unix peer uid. A pending/interrupted receipt is never dispatched
again automatically: inspect bench state, then stop/reconcile explicitly. A
client disconnect does not cancel task-owned execution. Service shutdown does.

Checkpoint, release and stop are reconciliation operations and do not require a
new request receipt to be writable. They still require the held lease token.
A repeated release may report forbidden/conflict after the lease was already cleared;
clients reconcile with status rather than clearing a new holder's lease.
`stop_admin` is a distinct operator action, not a client-provided privilege flag.
It fences first and retains the lease; the operator can inspect/checkpoint/release.

Lease tokens are opaque holder capabilities, not Accounts tokens, agent sessions
or work-run identities. Run IDs can name holders without authorizing the caller.
Local operator access permits arbitrary trusted commands with the service user's
authority. It is not tenant isolation. Remote HTTP, Accounts audiences/grants,
relay events, viewer/file APIs and suite adapters are separate contracts; this
local socket must not be exposed by an unauthenticated TCP proxy.

## Responses and failure

A response has version, optional operation, ok, optional result and optional
error `{code,message}`. Success requires result. Operation failures can retain
result/lease information so an authenticated operator can reconcile a failed run.
Status never returns a holder token. Error messages must not echo the submitted
token or raw request. Wire errors distinguish invalid_request, forbidden,
not_found, conflict, in_progress, operation_in_doubt, unavailable and
operation_failed. HTTP uses 400/403/404/409/503/422 respectively; oversized bodies
are 413 and unsupported media types 415. Malformed requests have no operation.

A receipt-save failure after core effects is operation_in_doubt with any available
retained result. No timeout or transport error proves a writer stopped or permits
reassignment. Errors do not erase the core's lease/checkpoint evidence.

## Creation and initial setup

`create` and `recover` accept optional `initialize: true`. The new CLI requests
it by default. Omitted `initialize` preserves legacy cold registration for old
clients; `false`, null, an unrelated operation or a setup-bypass flag is rejected.
Older producers reject the new field before effects. A client that requires a
warm bench must send it and must not fall back to a cold request after rejection.
This is producer-first rollout, not a new authorization or identity claim.

With `initialize: true`, the registered
checkout is reserved in the same authoritative transaction that publishes it,
before any setup can start or another holder can acquire it. Repositories with
setup instructions or a supported frozen dependency lockfile are prepared before
success. A repository without setup can become ready without running a command.
No caller-provided setup-bypass or holder claim is accepted in these requests.

Success means the initial setup, if present, stopped/fenced, produced durable
output evidence and reached its confirmed checkpoint/release. On setup or
checkpoint failure, a preserved registered checkout can return a held lease in
`result.bench.lease`, including its token to the authenticated operator that
submitted the operation. A reserved initialization that never launched a command
can also retain ownership. Status still redacts tokens. An error response or an
existing path is never permission to start an agent; reconcile using the
returned capability and current status. Even successful creation returns ready
for acquisition, not permission to write without a separate lease/run. Retrying creation with a new ID does
not rerun initialization on an already registered key.

A single request receipt covers registration, setup and completion. An interrupted
receipt is never automatically redispatched, including when only registration
completed. Cached results remain historical; replay never recreates ownership.
The local administrative cold-create path is not a socket operation. Legacy cold requests remain compatible. Clients must honor `ok`/error before
using paths and must request initialization to rely on warm completion.

Canonical `fixtures/superbench-api/creation.json` gives ready and retained-failure
outcomes without embedding setup implementation. Node checks the request shapes
and case consistency; the producer executes the lifecycle assertions with actual
Git and process fencing. These cases do not claim suite-consumer deployment.

## Execution limits

A manual `lease` returns mode `cooperative`; it coordinates trusted writers but
cannot prove that a process launched outside SuperBench stopped. `run`, `setup` and initial preparation for `create`/`recover` use mode
`supervised` execution on Linux with an atomic cgroup fence. A returned
cooperative lease can follow fenced preparation; its external writer is still
cooperative.
Suite adapters must not treat a cooperative lease as proof of fenced execution.
V1 grants neither terminal attachment nor managed external-writer registration;
those require separate contracts.

The response budget is 1 MiB. Status over that budget fails with unavailable;
clients can query a specific key. Growth receipts reserve 64 KiB per pending
operation, at most 10,000 receipts and 64 MiB of encoded receipts. Exhaustion
refuses new growth; reconciliation remains available. Automatic receipt deletion
is not part of this version. Cached lease replies can contain a historic token;
replaying them never restores the lease, and status is the current authority.
