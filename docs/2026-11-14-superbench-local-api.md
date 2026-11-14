# SuperBench local API v1

Status: producer-first contract proposal. The operator ruled SuperBench a
standalone product; charter's 2026-11-14 lifecycle boundary amendment remains
under review. This contract is not evidence that suite adapters are deployed.

The canonical request is `schemas/superbench/operation.v1.json`; shared positive,
negative and lexical-decoder vectors are `fixtures/superbench-api/operations.json`.
They are plain data, not CloudEvents and not additions to the event catalogue.
They are not yet published in an npm package. Go consumers pin copies with source
revision/hashes and run the same vectors; Node's schema test covers structural
vectors, while duplicate-key/trailing-document rejection belongs to the decoder.

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

## Execution limits

A manual `lease` returns mode `cooperative`; it coordinates trusted writers but
cannot prove that a process launched outside SuperBench stopped. Only `run` and
`setup` create mode `supervised` execution on Linux with an atomic cgroup fence.
Suite adapters must not treat a cooperative lease as proof of fenced execution.
The current implementation does not yet expose terminal attachment or a managed
external-writer registration protocol.

The response budget is 1 MiB. Status over that budget fails with unavailable;
clients can query a specific key. Growth receipts reserve 64 KiB per pending
operation, at most 10,000 receipts and 64 MiB of encoded receipts. Exhaustion
refuses new growth; reconciliation remains available. Automatic receipt deletion
is not part of this version. Cached lease replies can contain a historic token;
replaying them never restores the lease, and status is the current authority.
