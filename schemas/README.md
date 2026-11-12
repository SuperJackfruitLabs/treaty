# Event schemas

JSON Schemas (draft 2020-12) for the bodies suite products send, as plain data. `catalog.json`
names each event's CloudEvents `type` and the `dataschema` it points at, which is the schema's
`$id`: its address on the public repository.

## SuperPipeline (`superpipeline/`)

| Schema                           | Events                                           | Mirrors                                                         |
| -------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `gate.pending.v1.json`           | `gate.pending`                                   | `GatePendingBody`, `apps/api/src/board/views.ts`                |
| `elicitation.pending.v1.json`    | `elicitation.pending`                            | `ElicitationPendingBody`, same file                             |
| `record.v1.json`                 | the 15 record events, `gate.resolved` among them | `RecordPushBody`, `apps/api/src/push/events.ts`                 |
| `delivery.pending.v1.json`       | `delivery.pending`                               | `DeliveryPendingBody`, `apps/api/src/board/views.ts`            |
| `attention.pending.v1.json`      | `attention.pending`                              | `AttentionPendingBody`, same file                               |
| `decision.timeout.v1.json`       | `decision.reminded`, `decision.escalated`        | `DecisionNoticeBody`, `apps/api/src/board/decision-timeouts.ts` |
| `gate.approval_recorded.v1.json` | `gate.approval_recorded`                         | `GateApprovalRecordedBody`, `apps/api/src/board/views.ts`       |
| `decision.released.v1.json`      | `decision.released`                              | `DecisionReleasedBody`, same file                               |
| `decision.pulled_back.v1.json`   | `decision.pulled_back`                           | `DecisionPulledBackBody`, same file                             |
| `check.failed.v1.json`           | `check.failed`                                   | `CheckFailedBody`, same file                                    |
| `check.overridden.v1.json`       | `check.overridden`                               | `CheckOverriddenBody`, same file                                |
| `card.ready.v1.json`             | `card.ready`                                     | `CardReadyBody`, `apps/api/src/board/placement-window.ts`       |

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

## Not here

- **Run reports** go to SuperWitness (`POST /v1/runs`), which owns and publishes their schema at
  `https://docs.superwitness.dev/schemas/run-report.schema.json`. The catalogue points at it.
- **`work.available` and `cards.stale`**, SuperPipeline's pushes to an agent's own endpoint, are
  not decision events and have no schema here yet.

## Matrix (`matrix/`)

One schema per board-room Matrix event, named by its type string: the gates, questions,
follow-ups, waiting cards, notices and receipts a board's work crosses chat on, the answers a
person sends back, and AgentPod's harness permission envelope. Plain data, so SuperMessage's Rust
core and a Swift client read them without TypeScript. Published in
`@superjackfruitlabs/treaty-matrix-events` (`packages/matrix-events`), which also holds the
TypeScript that builds and reads them.

- Three files describe a card that rides inside a prose message under a content key rather than as
  an event of its own: `dev.superpipeline.gate`, `dev.superpipeline.elicitation` and
  `dev.agentpod.permission`.
- `subject.expires_at` (gate.v2, question.v2, delivery.v2, permission.v2) is an RFC 3339 date-time with
  seconds and an explicit offset, or null. It carries both `"format": "date-time"` and a `pattern`,
  because a validator need not assert `format`; `isSubjectExpiry` is the same rule in TypeScript.
- `x-uniqueBy` lists the paths whose values must not repeat, the one rule JSON Schema cannot state:
  `options[].id` is the `id` of every option.
- `fixtures/matrix-events/examples.json` is the corpus they are checked against, built by
  `scripts/matrix-examples.ts` from `fixtures/ecosystem-identity/matrix_gate_events.json` and from
  this package's builders. Each invalid case says what refuses it: the schema, a uniqueness rule, or
  only the carrier, against what it recorded when it posted.
