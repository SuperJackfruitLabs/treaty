import { describe, expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseType } from "../packages/cloudevents/src/index.ts";
import {
  isAttentionPending,
  isCheckFailed,
  isCheckOverridden,
  isDecisionPulledBack,
  isDecisionReleased,
  isDecisionTimeout,
  isDeliveryPending,
  isElicitationPending,
  isGateApprovalRecorded,
  isGatePending,
} from "../packages/matrix-events/src/index.ts";

const root = join(import.meta.dir, "..");
const read = (path: string) =>
  JSON.parse(readFileSync(join(root, path), "utf8"));
const RAW = "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";

const examples = read("fixtures/superpipeline-events/examples.json")
  .schemas as Record<
  string,
  {
    valid: Record<string, unknown>;
    invalid: Array<{ why: string; body: unknown }>;
  }
>;

describe("schemas/superpipeline", () => {
  const files = readdirSync(join(root, "schemas/superpipeline")).filter((f) =>
    f.endsWith(".json"),
  );

  test("every schema has examples, and every example set has a schema", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(
      Object.keys(examples).sort(),
    );
  });

  for (const file of files) {
    const schema = read(`schemas/superpipeline/${file}`);
    const name = file.replace(/\.json$/, "");
    const validator = new Validator(schema, "2020-12", false);

    test(`${name}: its $id is where it is published`, () => {
      expect(schema.$id).toBe(`${RAW}schemas/superpipeline/${file}`);
    });

    for (const [label, body] of Object.entries(examples[name]!.valid)) {
      test(`${name}: accepts ${label}`, () => {
        const result = validator.validate(body);
        expect(result.errors).toEqual([]);
      });
    }
    for (const { why, body } of examples[name]!.invalid) {
      test(`${name}: refuses — ${why}`, () => {
        expect(validator.validate(body).valid).toBe(false);
      });
    }
  }
});

/**
 * The carrier's own check of each pushed body (`@superjackfruitlabs/treaty-matrix-events`, which
 * the AgentPod hub runs on SuperPipeline's push). Every body a schema accepts as valid here must also
 * pass it, so a schema and the reader cannot drift apart on the examples.
 *
 * One known difference, pinned so that either side moving shows here: the schemas allow `boardId:
 * null` (SuperPipeline's type, for a board not yet initialised) and the carrier refuses it, since it
 * cannot route an event to no board.
 */
const CARRIER: Record<string, (body: unknown) => boolean> = {
  "gate.pending.v1": isGatePending,
  "elicitation.pending.v1": isElicitationPending,
  "delivery.pending.v1": isDeliveryPending,
  "attention.pending.v1": isAttentionPending,
  "decision.timeout.v1": isDecisionTimeout,
  "gate.approval_recorded.v1": isGateApprovalRecorded,
  "decision.released.v1": isDecisionReleased,
  "decision.pulled_back.v1": isDecisionPulledBack,
  "check.failed.v1": isCheckFailed,
  "check.overridden.v1": isCheckOverridden,
};

describe("the carrier reads what the schemas accept", () => {
  for (const [name, accepts] of Object.entries(CARRIER)) {
    for (const [label, body] of Object.entries(examples[name]?.valid ?? {})) {
      const boardId = (body as { boardId?: unknown }).boardId;
      test(`${name}: ${label}${boardId === null ? " (refused: no boardId)" : ""}`, () =>
        expect(accepts(body)).toBe(boardId !== null));
    }
    test(`${name}: has examples`, () =>
      expect(Object.keys(examples[name]?.valid ?? {}).length).toBeGreaterThan(
        0,
      ));
  }
});

describe("schemas/catalog.json", () => {
  const catalog = read("schemas/catalog.json") as {
    events: Array<{
      producer: string;
      pushName: string;
      type: string;
      dataschema: string;
    }>;
  };

  for (const e of catalog.events) {
    test(`${e.pushName}: a suite type, and a schema that exists`, () => {
      expect(parseType(e.type).product).toBe(e.producer);
      expect(e.dataschema.startsWith(RAW)).toBe(true);
      expect(existsSync(join(root, e.dataschema.slice(RAW.length)))).toBe(true);
    });
  }

  for (const e of catalog.events) {
    test(`${e.pushName}: its schema allows the event, and the type names it`, () => {
      const schema = read(e.dataschema.slice(RAW.length));
      const event = schema.properties.event;
      const allowed: string[] = event.enum ?? [event.const];
      expect(allowed).toContain(e.pushName);
      const { entity, verb } = parseType(e.type);
      // `card.comment.added` is entity `card_comment`, verb `added`.
      const dot = e.pushName.lastIndexOf(".");
      expect(`${entity}.${verb}`).toBe(
        `${e.pushName.slice(0, dot).replaceAll(".", "_")}${e.pushName.slice(dot)}`,
      );
    });
  }

  test("every event a schema allows is in the catalogue", () => {
    const listed = new Set(catalog.events.map((e) => e.pushName));
    for (const file of readdirSync(join(root, "schemas/superpipeline"))) {
      if (!file.endsWith(".json")) continue;
      const event = read(`schemas/superpipeline/${file}`).properties.event;
      for (const name of event.enum ?? [event.const])
        expect({ file, name, listed: listed.has(name) }).toEqual({
          file,
          name,
          listed: true,
        });
    }
  });

  test("names each type once", () => {
    const types = catalog.events.map((e) => e.type);
    expect(new Set(types).size).toBe(types.length);
  });

  test("lists every record event the record schema allows", () => {
    const record = read("schemas/superpipeline/record.v1.json");
    const listed = catalog.events
      .filter((e) => e.dataschema.endsWith("/record.v1.json"))
      .map((e) => e.pushName);
    expect(listed.sort()).toEqual([...record.properties.event.enum].sort());
  });
});
