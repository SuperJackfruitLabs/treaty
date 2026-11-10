/**
 * JSON Schemas (draft 2020-12) for the events suite products send, and the catalogue that names
 * each event's CloudEvents `type` and `dataschema`.
 *
 * The schemas live in `schemas/` at the repository root as plain data, so Go and Swift can read
 * them. The build copies them into this package. Import one by its subpath:
 *
 *   import gatePending from "@superjackfruitlabs/treaty-event-schemas/superpipeline/gate.pending.v1.json" with { type: "json" };
 */

/** Where a schema is published: its `$id`, and the `dataschema` of every event that uses it. */
export const SCHEMA_BASE =
  "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/schemas/" as const;
