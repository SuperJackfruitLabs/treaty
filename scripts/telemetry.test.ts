import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { readRegistry } from "../packages/contracts/src/registry.ts";
import {
  checkTelemetryConventions,
  telemetryConventions,
} from "../packages/contracts/src/telemetry.ts";

const bundle = loadBundle(join(import.meta.dir, ".."));
const registry = readRegistry(bundle);
const files = [...bundle.files.keys()]
  .filter((p) => /^schemas\/telemetry\/.+\.json$/.test(p))
  .toSorted();

describe("schemas/telemetry", () => {
  test("the telemetry conventions are recorded here, so adding a file is a visible diff", () => {
    expect(files).toEqual(["schemas/telemetry/suite.v1.json"]);
  });

  for (const path of files) {
    test(`${path} keeps every rule, and its cases answer as they say`, () => {
      expect(checkTelemetryConventions(bundle, path)).toEqual([]);
    });
  }

  test("every telemetry crossing's conventions exist", () => {
    const missing = registry.crossings
      .filter((c) => c.kind === "telemetry")
      .flatMap((c) => c.contract)
      .filter((p) => p.startsWith("schemas/") && !files.includes(p));
    expect(missing).toEqual([]);
  });

  test("the suite's spans, and the keys the plan names, are all there", () => {
    const suite = telemetryConventions(bundle, "suite.v1");
    expect(Object.keys(suite.spans).toSorted()).toEqual([
      "attempt",
      "dispatch",
      "run_route",
      "turn",
    ]);
    for (const key of [
      "run.id",
      "attempt.id",
      "attempt.state",
      "acp.session_id",
      "acp.seq_from",
      "acp.seq_to",
      "station.id",
      "harness.name",
      "run.epoch",
      "card.id",
      "board.id",
    ])
      expect(suite.attributes[key]).toBeDefined();
    expect(suite.propagation["acp-meta-traceparent"]?.methods).toEqual([
      "session/new",
      "session/prompt",
    ]);
  });

  test("SuperWitness joins a run by run.id on the dispatch span and attempt.id on attempt and turn", () => {
    // internal/source/traces/adapter.go searches by run.id; internal/join/join.go counts spans
    // by attempt.id; internal/canary/checks.go looks for dispatch, attempt and turn.
    const suite = telemetryConventions(bundle, "suite.v1");
    expect(suite.spans.dispatch?.required).toContain("run.id");
    expect(suite.spans.attempt?.required).toContain("attempt.id");
    expect(suite.spans.turn?.required).toContain("attempt.id");
    expect(suite.logs["run route"]?.required).toContain("run.id");
  });
});
