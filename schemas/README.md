# Event schemas

JSON Schemas (draft 2020-12) for the bodies suite products send, as plain data. `catalog.json`
names each event's CloudEvents `type` and the `dataschema` it points at, which is the schema's
`$id`: its address on the public repository.

## SuperPipeline (`superpipeline/`)

| Schema                        | Events                                           | Mirrors                                          |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `gate.pending.v1.json`        | `gate.pending`                                   | `GatePendingBody`, `apps/api/src/board/views.ts` |
| `elicitation.pending.v1.json` | `elicitation.pending`                            | `ElicitationPendingBody`, same file              |
| `record.v1.json`              | the 15 record events, `gate.resolved` among them | `RecordPushBody`, `apps/api/src/push/events.ts`  |

The schemas are written from SuperPipeline's types. SuperPipeline's own test validates the bodies
its builders produce against them, so a type that moves without its schema fails there.

**Readers ignore properties they do not know.** The schemas do not forbid extra properties, so a
producer can add an optional field without a new version. Removing or renaming a field, or
changing what one means, is a new version published beside the old one.

`fixtures/superpipeline-events/examples.json` holds bodies each schema must accept and refuse.

## Not here

- **Run reports** go to SuperWitness (`POST /v1/runs`), which owns and publishes their schema at
  `https://docs.superwitness.dev/schemas/run-report.schema.json`. The catalogue points at it.
- **SuperPipeline's other pushed events** (`delivery.pending`, `attention.pending`, the decision
  notices, `check.failed` and the rest) come in a later change.
