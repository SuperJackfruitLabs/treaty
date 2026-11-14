---
title: treaty-event-schemas
description: "@superjackfruitlabs/treaty-event-schemas: the JSON Schemas for the events SuperPipeline sends, and the catalogue of CloudEvents types."
---

[`@superjackfruitlabs/treaty-event-schemas`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-event-schemas)
holds the JSON Schemas (draft 2020-12) for the bodies SuperPipeline sends, and `catalog.json`, which
names each event's CloudEvents `type` and the `dataschema` it points at. Use it when you need to
validate a body at either end or find the `dataschema` before you put an event on the wire.

```ts
import catalog from "@superjackfruitlabs/treaty-event-schemas/catalog.json" with { type: "json" };
import gatePending from "@superjackfruitlabs/treaty-event-schemas/superpipeline/gate.pending.v1.json" with { type: "json" };
import { SCHEMA_BASE } from "@superjackfruitlabs/treaty-event-schemas";
```

Those imports give you both halves of the lookup: the catalogue tells you which schema belongs to
an event, and the schema lets your validator check its body.

| Export | What |
| --- | --- |
| `./catalog.json` | Every event: `producer`, `pushName` (the body's `event`), `type` and `dataschema`. Also `elsewhere`: events whose schema another product owns. |
| `./superpipeline/*.json` | One schema per body. The [event catalogue](/events/) has a page for each. |
| `SCHEMA_BASE` | Where the schemas are published: each schema's `$id`, and every event's `dataschema`, starts with it. |

The catalogue provides the `dataschema` for each event SuperPipeline relays; every catalogue entry
is checked against a schema Treaty holds.

**Not here:** run reports, which SuperWitness owns and publishes the schema for, and SuperPipeline's
`work.available` and `cards.stale`, which go to an agent's own endpoint and have no schema yet.
