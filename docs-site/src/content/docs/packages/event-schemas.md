---
title: treaty-event-schemas
description: "@superjackfruitlabs/treaty-event-schemas: the JSON Schemas for the events SuperPipeline sends, and the catalogue of CloudEvents types."
---

[`@superjackfruitlabs/treaty-event-schemas`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-event-schemas)
holds the JSON Schemas (draft 2020-12) for the bodies SuperPipeline sends, and `catalog.json`, which
names each event's CloudEvents `type` and the `dataschema` it points at. **Use it** to validate a
body you send or receive, or to find the `dataschema` for an event you put on the wire.

```ts
import catalog from "@superjackfruitlabs/treaty-event-schemas/catalog.json" with { type: "json" };
import gatePending from "@superjackfruitlabs/treaty-event-schemas/superpipeline/gate.pending.v1.json" with { type: "json" };
import { SCHEMA_BASE } from "@superjackfruitlabs/treaty-event-schemas";
```

| Export | What |
| --- | --- |
| `./catalog.json` | Every event: `producer`, `pushName` (the body's `event`), `type` and `dataschema`. Also `elsewhere`: events whose schema another product owns. |
| `./superpipeline/*.json` | One schema per body. The [event catalogue](/events/) has a page for each. |
| `SCHEMA_BASE` | Where the schemas are published: each schema's `$id`, and every event's `dataschema`, starts with it. |

SuperPipeline uses the catalogue to choose the `dataschema` for each event it relays, and refuses
to relay an event the catalogue has no schema for.

**Not here:** run reports, which SuperWitness owns and publishes the schema for, and SuperPipeline's
`work.available` and `cards.stale`, which go to an agent's own endpoint and have no schema yet.
