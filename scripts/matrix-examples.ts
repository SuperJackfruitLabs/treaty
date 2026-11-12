/**
 * Builds `fixtures/matrix-events/examples.json`, the corpus every schema in `schemas/matrix/` is
 * checked against: `bun scripts/matrix-examples.ts` writes it, and `scripts/matrix-schemas.test.ts`
 * fails when the file is not what this builds.
 *
 * Two sources, so the corpus records what the products already agree on rather than what this
 * package thinks:
 *
 * - every `accept` and `reject` case of `fixtures/ecosystem-identity/matrix_gate_events.json`, the
 *   corpus the AgentPod hub and SuperMessage's core have pinned since 2026-08; and
 * - content built by this package's own builders from the bodies SuperPipeline sends, so a builder
 *   that drifts from its schema, or changes what it emits, changes this file.
 *
 * Each invalid case says what refuses it (`refusedBy`): `schema` (the JSON Schema), `unique` (an
 * `x-uniqueBy` rule of that schema), or `recorded` (only the carrier can, against what it recorded
 * when it posted: an option the gate did not offer, a binding that names another subject).
 *
 * The cases are made in `scripts/matrix-examples/`: `source.ts` (the source corpus), `inputs.ts`
 * (the SuperPipeline bodies), `built.ts` (valid cases from the builders), `card-invalid.ts` and
 * `derived-invalid.ts` (the invalid cases the source corpus does not hold).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { built } from "./matrix-examples/built.ts";
import { cardInvalid } from "./matrix-examples/card-invalid.ts";
import { derivedInvalid } from "./matrix-examples/derived-invalid.ts";
import { fromSourceCorpus } from "./matrix-examples/source.ts";
import type { Examples } from "./matrix-examples/types.ts";

const root = join(import.meta.dir, "..");
export const EXAMPLES_PATH = join(root, "fixtures/matrix-events/examples.json");

export function buildExamples(): unknown {
  const schemas: Examples = {};
  fromSourceCorpus(schemas);
  built(schemas);
  cardInvalid(schemas);
  derivedInvalid(schemas);
  const sorted = Object.fromEntries(
    Object.entries(schemas).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return {
    corpus: "matrix-events",
    version: 1,
    generatedBy: "scripts/matrix-examples.ts; do not edit by hand",
    sources: [
      "fixtures/ecosystem-identity/matrix_gate_events.json (version 11): every accept and reject case",
      "content built by @superjackfruitlabs/treaty-matrix-events from bodies SuperPipeline sends (labels starting `built:`)",
    ],
    howToRead: {
      valid:
        "Content a sender may emit and a reader must handle, keyed by what it shows.",
      invalid:
        "Content a sender must not emit and a carrier must not act on. `refusedBy` says what refuses it: `schema` (the type's JSON Schema), `unique` (an `x-uniqueBy` rule of that schema), or `recorded` (only the carrier, against what it recorded when it posted: an option it did not offer, a binding to another subject). A renderer's obligation is narrower: offer no decision it cannot honestly resolve.",
    },
    schemas: sorted,
  };
}

if (import.meta.main) {
  writeFileSync(EXAMPLES_PATH, `${JSON.stringify(buildExamples(), null, 2)}\n`);
  console.log(`wrote ${EXAMPLES_PATH}`);
}
