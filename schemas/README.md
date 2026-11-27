# Schemas

Every contract treaty holds, as JSON Schema draft 2020-12. Each schema's `$id` is its address on
the public repository, and every schema belongs to a crossing in
[`contracts/registry.json`](../contracts/registry.json). The one exception is a schema its owner
publishes at its own URL, held here byte for byte with that `$id`; `contracts/published-ids.json`
lists it (`superwitness/run-report.v1.json`).

- `common/`: pieces other contracts reference, such as the error envelopes (`error.v1`,
  `flat-error.v1`, `matrix-error.v1`, and RFC 6750's `oauth-bearer-error.v1`).
- `http/`: HTTP APIs as OpenAPI 3.1 documents ([conventions](http/README.md)).
- `mcp/`: MCP tool catalogs: each tool's name, scope, input schema and result, with cases in
  `fixtures/mcp/`. Their form is `treaty/mcp-catalog.v1.json`.
- `telemetry/`: telemetry conventions: span names, attribute keys and their types, and trace
  propagation, with cases in `fixtures/telemetry/`. Their form is
  `treaty/telemetry-conventions.v1.json`.
- `urls/`: URL shapes: a URL's origins, path and parameters, with cases in `fixtures/urls/`.
  Their form is `treaty/url-shape.v1.json`.
- `supertoolkit/`: SuperToolkit's CLI as AgentPod runs it: each `stk … --json` output under
  `cli/`, and the policy file (`policy.v1.json`), with cases in `fixtures/supertoolkit/`.
- `treaty/`: the shape of treaty's own files: the registry, the error codes, a product's
  `treaty.json`, an artifact record (`contracts/artifacts/`), a built-in service list
  (`contracts/supertoolkit/`) and the three forms above.

The sections below describe the event and Matrix schemas.

# Event schemas

JSON Schemas (draft 2020-12) for the bodies suite products send, as plain data. `catalog.json`
names each event's CloudEvents `type` and the `dataschema` it points at, which is the schema's
`$id`: its address on the public repository.

## SuperPipeline (`superpipeline/`)

| Schema                           | Events                                           | Mirrors                                                               |
| -------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| `gate.pending.v1.json`           | `gate.pending`                                   | `GatePendingBody`, `apps/api/src/board/views.ts`                      |
| `elicitation.pending.v1.json`    | `elicitation.pending`                            | `ElicitationPendingBody`, same file                                   |
| `record.v1.json`                 | the 15 record events, `gate.resolved` among them | `RecordPushBody`, `apps/api/src/push/events.ts`                       |
| `delivery.pending.v1.json`       | `delivery.pending`                               | `DeliveryPendingBody`, `apps/api/src/board/views.ts`                  |
| `attention.pending.v1.json`      | `attention.pending`                              | `AttentionPendingBody`, same file                                     |
| `decision.timeout.v1.json`       | `decision.reminded`, `decision.escalated`        | `DecisionNoticeBody`, `apps/api/src/board/decision-timeouts.ts`       |
| `gate.approval_recorded.v1.json` | `gate.approval_recorded`                         | `GateApprovalRecordedBody`, `apps/api/src/board/views.ts`             |
| `decision.released.v1.json`      | `decision.released`                              | `DecisionReleasedBody`, same file                                     |
| `decision.pulled_back.v1.json`   | `decision.pulled_back`                           | `DecisionPulledBackBody`, same file                                   |
| `check.failed.v1.json`           | `check.failed`                                   | `CheckFailedBody`, same file                                          |
| `check.overridden.v1.json`       | `check.overridden`                               | `CheckOverriddenBody`, same file                                      |
| `card.ready.v1.json`             | `card.ready`                                     | `CardReadyBody`, `apps/api/src/board/placement-window.ts`             |
| `work.available.v1.json`         | `work.available`                                 | the body `notifyWorkAvailable` builds, `apps/api/src/board/claims.ts` |
| `cards.stale.v1.json`            | `cards.stale`                                    | the body `sendStaleDigest` builds, `apps/api/src/board/stale.ts`      |

The schemas are written from SuperPipeline's types. SuperPipeline's own test validates the bodies
its builders produce against them, so a type that moves without its schema fails there.

**Readers ignore properties they do not know.** The schemas do not forbid extra properties, so a
producer can add an optional field without a new version. Removing or renaming a field, or
changing what one means, is a new version published beside the old one.

`fixtures/superpipeline-events/examples.json` holds bodies each schema must accept and refuse.
Every body a schema accepts there must also pass the carrier's own check in
`@superjackfruitlabs/treaty-matrix-events` (`isDeliveryPending`, `isCheckFailed` and the rest),
except `boardId: null`: SuperPipeline's type allows it and the carrier refuses it, as it cannot
route an event to no board.

`card.ready` is not a chat event: no carrier reads it. A board opted into scheduling sends it
when a card becomes ready to claim, so a placement service can place the card inside the board's
placement window instead of waiting for its next sweep.

`work.available` and `cards.stale` are not chat events either. They travel only on the direct
push, to the push configs that subscribed to them: `work.available` to an agent that could claim
the card, `cards.stale` once per daily digest.

## Delivery and the receiver's answer

Every event reaches a subscriber the same way on either path, the relay or SuperPipeline's direct
push: an HTTP POST in CloudEvents binary mode, signed with
`x-treaty-signature: t=<unix>,v1=<HMAC-SHA256>` over `<t>.<id>.<body>`, checked with
`verifyDelivery` from `@superjackfruitlabs/treaty-cloudevents` within 300 s. On the direct push
the secret is the push config's `token`. `fixtures/cloudevents/push-delivery.json` holds signed
vectors and the deliveries a receiver must refuse; registering a push config is
`http/superpipeline/push.v1.openapi.json`.

The receiver's status says what the sender does next, on both paths:

- **2xx:** handled, or permanently ignored, such as an event the receiver does not take. Not sent
  again.
- **503:** transient, such as a board this receiver has not mapped yet. Sent again later.
- **Any other 4xx:** permanently refused, such as an invalid body. Not sent again.

A receiver answers 503, not 404, for something it expects to know soon. Delivery is at least
once, so a receiver handles each event id once (`handleOnce` from
`@superjackfruitlabs/treaty-outbox`).

## Not here

- **Run reports** go to SuperWitness (`POST /v1/runs`), which owns and publishes their schema at
  `https://docs.superwitness.dev/schemas/run-report.schema.json`. They are not events: the
  catalogue points at the schema, and treaty holds the same file, `$id` unchanged, at
  `superwitness/run-report.v1.json`, the request body of `http/superwitness/runs.v1.openapi.json`.

## Matrix (`matrix/`)

One schema per board-room Matrix event, named by its type string: the gates, questions,
follow-ups, waiting cards, notices and receipts a board's work crosses chat on, the answers a
person sends back, AgentPod's harness permission envelope, and AgentPod's chat activity in a
station room. Plain data, so SuperMessage's Rust
core and a Swift client read them without TypeScript. Published in
`@superjackfruitlabs/treaty-matrix-events` (`packages/matrix-events`), which also holds the
TypeScript that builds and reads them.

- Three files describe a card that rides inside a prose message under a content key rather than as
  an event of its own: `dev.superpipeline.gate`, `dev.superpipeline.elicitation` and
  `dev.agentpod.permission`.
- Seven files describe AgentPod's chat activity (ruling 6 of
  `docs/2026-11-23-every-crossing-phase-2.md`): the turn record `dev.agentpod.turn.v1`, the live
  deltas `dev.agentpod.stream.delta`, `dev.agentpod.thought.delta` and `dev.agentpod.tool.update`,
  and the content keys `dev.agentpod.turn_error`, `dev.agentpod.voice_transcript` and
  `dev.agentpod.voice_reply`. They describe bodies only; how often AgentPod sends them is its own.
- **`x-treaty-carrier`** says how a body rides, on every schema that has one:
  - `{"kind": "room-event"}`: the content of a room event whose type is the file's name;
  - `{"kind": "to-device"}`: the content of a to-device event of that type, sent to a reader's own
    devices and never stored in a room;
  - `{"kind": "content-key", "key": "…", "msgtype": "…"}`: the value under `key` in the content of
    an `m.room.message` with that `msgtype`, whose `body` stays the fallback every client shows.
- **Enums are open to readers** where a schema lists `x-treaty-known-values`: the field is a
  string, the list is what producers send today, and a value not in it is valid and drawn
  generically, never dropped. The producer's narrower set is in the field's description.
- **`schema_version`** in the activity shapes is an integer of at least 1, not a literal: a reader
  draws a higher version best-effort and never drops it. The deltas carry no version and change
  only additively. `session_id` there is a turn-scoped id: a new value starts a new turn.
- `subject.expires_at` (gate.v2, question.v2, delivery.v2, permission.v2) is an RFC 3339 date-time with
  seconds and an explicit offset, or null. It carries both `"format": "date-time"` and a `pattern`,
  because a validator need not assert `format`; `isSubjectExpiry` is the same rule in TypeScript.
- `x-uniqueBy` lists the paths whose values must not repeat, the one rule JSON Schema cannot state:
  `options[].id` is the `id` of every option.
- `fixtures/matrix-events/examples.json` is the corpus they are checked against, built by
  `scripts/matrix-examples.ts` from `fixtures/ecosystem-identity/matrix_gate_events.json` and from
  this package's builders. Each invalid case says what refuses it: the schema, a uniqueness rule, or
  only the carrier, against what it recorded when it posted.

## SuperBench local operations (`superbench/`)

`operation.v1.json` describes the local Unix-peer operator API, not an event.
Its corpus is `fixtures/superbench-api/operations.json`; the transport/authority
contract is [the local API proposal](../docs/2026-11-14-superbench-local-api.md).
No CloudEvents catalogue entry or remote token audience is implied.

Every schema of `superbench.local-api` has valid and invalid cases in
`fixtures/superbench-api/cases.json`, decided by the schema alone; the remote credential's are in
`fixtures/superbench-api/remote-credentials.json`. A case labelled as an entry of a shared corpus is
that entry; `scripts/superbench-local-api-cases.test.ts` fails if the two drift.

## SuperToolkit's CLI (`supertoolkit/`)

AgentPod's node-agent runs `stk` and reads what it prints. Each schema under `cli/` is one
command's stdout with `--json`: `handover key`, `handover open`, `verify`, `reload`, `env`,
`doctor` and `doctor --probe`. Their valid cases are the JSON in stk's characterization goldens
(`cmd/stk/testdata/cli-*.golden.txt`), unchanged. `version`, `revoke --local` and `install`
print text and are not contracted. A failure is an exit code and a `stk: …` line on stderr,
which is not contracted either: contracting it would be a CLI change, not a record of what ships
(phase 4, ruling 4).

`policy.v1.json` is `supertoolkit.yaml` as AgentPod writes it, as JSON Schema over the YAML's
data model: parse the YAML, then validate the value. Only `services` is contracted; a
`kind: forge` service holds to the keys AgentPod writes plus `api_prefix`, and may not take a
name in `contracts/supertoolkit/builtin-services.json`, stk's compiled-in services.
`fixtures/supertoolkit/` also holds the hand-over corpus and the two managed-protocol corpora,
byte for byte stk's.
