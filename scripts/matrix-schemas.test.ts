import { describe, expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ElicitationRequestCard,
  GateRequestCard,
  PermissionRequestEvent,
  parseAttentionAnswer,
  parseCheckOverride,
  parseDeliveryAnswer,
  parseGateDecision,
  parsePermissionAnswer,
  parsePullBack,
  parseQuestionAnswer,
  uniqueByViolations,
} from "../packages/matrix-events/src/index.ts";
import { EXAMPLES_PATH, buildExamples } from "./matrix-examples.ts";

const root = join(import.meta.dir, "..");
const RAW = "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
const corpus = JSON.parse(readFileSync(EXAMPLES_PATH, "utf8")) as {
  schemas: Record<
    string,
    {
      valid: Record<string, unknown>;
      invalid: Array<{
        why: string;
        refusedBy: "schema" | "unique" | "recorded";
        body: unknown;
      }>;
    }
  >;
};

/** The TypeScript reading of each inbound type, and of each v1 card. */
const PARSERS: Record<string, (content: unknown) => boolean> = {
  "dev.superpipeline.gate.decision.v1": (c) =>
    parseGateDecision(c)?.version === 1,
  "dev.superpipeline.gate.decision.v2": (c) =>
    parseGateDecision(c)?.version === 2,
  "dev.superpipeline.question.answer.v2": (c) =>
    parseQuestionAnswer(c) !== null,
  "dev.superpipeline.delivery.answer.v2": (c) =>
    parseDeliveryAnswer(c) !== null,
  "dev.superpipeline.attention.answer.v2": (c) =>
    parseAttentionAnswer(c) !== null,
  "dev.agentpod.permission.answer.v2": (c) => parsePermissionAnswer(c) !== null,
  "dev.superpipeline.gate.pull_back.v2": (c) => parsePullBack(c) !== null,
  "dev.superpipeline.check.override.v2": (c) => parseCheckOverride(c) !== null,
};
const CARDS: Record<string, (content: unknown) => boolean> = {
  "dev.superpipeline.gate": (c) => GateRequestCard.safeParse(c).success,
  "dev.superpipeline.elicitation": (c) =>
    ElicitationRequestCard.safeParse(c).success,
  "dev.agentpod.permission": (c) => PermissionRequestEvent.safeParse(c).success,
  "dev.agentpod.permission.v1": (c) =>
    PermissionRequestEvent.safeParse(c).success,
};

test("the corpus is what scripts/matrix-examples.ts builds (run it after changing a builder)", () => {
  expect(corpus).toEqual(buildExamples() as typeof corpus);
});

describe("schemas/matrix", () => {
  const files = readdirSync(join(root, "schemas/matrix")).filter((f) =>
    f.endsWith(".json"),
  );

  test("every schema has examples, and every example set has a schema", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).toSorted()).toEqual(
      Object.keys(corpus.schemas).toSorted(),
    );
  });

  for (const file of files) {
    const schema = JSON.parse(
      readFileSync(join(root, "schemas/matrix", file), "utf8"),
    );
    const name = file.replace(/\.json$/, "");
    const validator = new Validator(schema, "2020-12", false);
    const uniqueBy: string[] = schema["x-uniqueBy"] ?? [];
    const examples = corpus.schemas[name]!;

    test(`${name}: its $id is where it is published`, () => {
      expect(schema.$id).toBe(`${RAW}schemas/matrix/${file}`);
    });

    test(`${name}: has valid and invalid examples`, () => {
      expect(Object.keys(examples.valid).length).toBeGreaterThan(0);
      expect(examples.invalid.length).toBeGreaterThan(0);
    });

    for (const [label, body] of Object.entries(examples.valid)) {
      test(`${name}: accepts ${label}`, () => {
        expect(validator.validate(body).errors).toEqual([]);
        expect(uniqueByViolations(body, uniqueBy)).toEqual([]);
        if (PARSERS[name]) expect(PARSERS[name](body)).toBe(true);
        if (CARDS[name]) expect(CARDS[name](body)).toBe(true);
      });
    }

    for (const { why, refusedBy, body } of examples.invalid) {
      test(`${name}: refuses (${refusedBy}) ${why}`, () => {
        const schemaRefuses = !validator.validate(body).valid;
        const uniqueRefuses = uniqueByViolations(body, uniqueBy).length > 0;
        // Each case is refused by exactly what it says, so a schema that starts catching a
        // `recorded` case, or stops catching a `schema` one, fails here.
        expect({ schemaRefuses, uniqueRefuses }).toEqual({
          schemaRefuses: refusedBy === "schema",
          uniqueRefuses: refusedBy === "unique",
        });
        if (CARDS[name] && refusedBy !== "recorded")
          expect(CARDS[name](body)).toBe(false);
      });
    }
  }
});
