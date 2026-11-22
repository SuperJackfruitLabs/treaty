import { describe, expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A card narrows a stage's repository allowlist; the claim carries the narrowed
// checkpoint-policy.v1. The vectors were generated separately in Python. This file
// holds an independent test adapter of the narrowing, not a product parser.

const root = join(import.meta.dir, "..");
const read = (path: string) =>
  JSON.parse(readFileSync(join(root, path), "utf8"));
const schemas = "schemas/superpipeline-api";
const validator = (file: string) => new Validator(read(file), "2020-12", false);
const policyV1 = validator(`${schemas}/run-checkpoint-policy.v1.json`);
const policyV2 = validator(`${schemas}/run-checkpoint-policy.v2.json`);
const cardSchema = validator(`${schemas}/card-repositories.v1.json`);
const selectionSchema = validator(
  `${schemas}/run-checkpoint-selection.v1.json`,
);

interface Repository {
  name: string;
  provider: string;
  repository: string;
}
interface Policy {
  version: string;
  kind: string;
  allowUnchanged: boolean;
  repositories: Repository[];
  checkpointRepository: string;
  reporterPrincipalId: string;
  nodeId: string;
  executors: unknown[];
  repositorySelection?: string;
  defaultRepositories?: string[];
}
interface Card {
  repositories?: string[];
  primaryRepository?: string;
}
interface Group {
  schema: string;
  accept: Array<{ name: string; body: unknown }>;
  reject: Array<{ name: string; body: unknown }>;
}
interface Selection {
  version: string;
  stagePolicyDigest: string;
  source: "card" | "default" | "single";
  repositories: string[];
  checkpointRepository: string;
}
interface Corpus {
  stages: Record<string, Policy>;
  structural: Record<string, Group>;
  policyRelations: Array<{ name: string; policy: Policy; refuse: string }>;
  narrowing: Array<{
    name: string;
    stage: string;
    card: Card;
    refuse?: string;
    expect?: { policy: Policy; policyDigest: string; selection?: Selection };
  }>;
  producer: Array<{ name: string; scope: string }>;
}
const corpus: Corpus = read(
  "fixtures/superpipeline-run-checkpoint/selection.json",
);

// The same ASCII canonical form as run-checkpoint.test.ts, restated so this file
// stands alone.
function quote(value: string): string {
  let result = '"';
  for (const scalar of value) {
    const code = scalar.codePointAt(0) ?? 0;
    if (scalar === '"' || scalar === "\\") result += "\\" + scalar;
    else if (code >= 32 && code <= 126) result += scalar;
    else
      for (const unit of scalar.split(""))
        result += "\\u" + unit.charCodeAt(0).toString(16).padStart(4, "0");
  }
  return result + '"';
}
function canonical(value: unknown): string {
  if (typeof value === "string") return quote(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => quote(key) + ":" + canonical(item))
        .join(",") +
      "}"
    );
  throw new Error("unsupported canonical value");
}
const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");

class Refused extends Error {}
const sortedUnique = (names: string[]) =>
  names.every((name, i) => i === 0 || (names[i - 1] ?? "") < name);

function relations(policy: Policy): void {
  const names = policy.repositories.map((r) => r.name);
  if (!sortedUnique(names)) throw new Refused("repositories-not-canonical");
  if (!names.includes(policy.checkpointRepository))
    throw new Refused("checkpoint-repository-not-allowed");
  const defaults = policy.defaultRepositories;
  if (defaults === undefined) return;
  if (!sortedUnique(defaults)) throw new Refused("default-not-canonical");
  if (defaults.some((name) => !names.includes(name)))
    throw new Refused("default-not-allowed");
  if (!defaults.includes(policy.checkpointRepository) && defaults.length !== 1)
    throw new Refused("default-without-start");
}

function narrow(policy: Policy, card: Card) {
  if (policy.version === "superpipeline.checkpoint-policy.v1")
    return { policy };
  relations(policy);
  const names = policy.repositories.map((r) => r.name);
  let source: "card" | "default" | "single";
  let chosen: string[];
  let start: string;
  if (card.repositories !== undefined) {
    chosen = card.repositories;
    if (!sortedUnique(chosen)) throw new Refused("repositories-not-canonical");
    if (chosen.some((name) => !names.includes(name)))
      throw new Refused("repository-not-allowed");
    source = "card";
    if (card.primaryRepository !== undefined) {
      if (!chosen.includes(card.primaryRepository))
        throw new Refused("primary-not-chosen");
      start = card.primaryRepository;
    } else if (chosen.includes(policy.checkpointRepository))
      start = policy.checkpointRepository;
    else if (chosen.length === 1) start = chosen[0] ?? "";
    else throw new Refused("no-primary");
  } else if (card.primaryRepository !== undefined) {
    throw new Refused("primary-without-repositories");
  } else if (policy.defaultRepositories !== undefined) {
    source = "default";
    chosen = policy.defaultRepositories;
    start = chosen.includes(policy.checkpointRepository)
      ? policy.checkpointRepository
      : (chosen[0] ?? "");
  } else if (names.length === 1) {
    source = "single";
    chosen = names;
    start = names[0] ?? "";
  } else throw new Refused("needs-person");
  return {
    policy: {
      version: "superpipeline.checkpoint-policy.v1",
      kind: policy.kind,
      allowUnchanged: policy.allowUnchanged,
      repositories: policy.repositories.filter((r) => chosen.includes(r.name)),
      checkpointRepository: start,
      reporterPrincipalId: policy.reporterPrincipalId,
      nodeId: policy.nodeId,
      executors: policy.executors,
    },
    selection: {
      version: "superpipeline.checkpoint-selection.v1",
      stagePolicyDigest: digest(policy),
      source,
      repositories: chosen,
      checkpointRepository: start,
    },
  };
}

describe("structural cases", () => {
  for (const group of Object.values(corpus.structural)) {
    const check = validator(group.schema);
    for (const item of group.accept)
      test(`${group.schema}: accepts ${item.name}`, () => {
        expect(check.validate(item.body).errors).toEqual([]);
      });
    for (const item of group.reject)
      test(`${group.schema}: refuses ${item.name}`, () => {
        expect(check.validate(item.body).valid).toBe(false);
      });
  }
});

describe("stage policies", () => {
  for (const [name, policy] of Object.entries(corpus.stages)) {
    test(`${name} is a valid ${policy.version}`, () => {
      const check =
        policy.version === "superpipeline.checkpoint-policy.v1"
          ? policyV1
          : policyV2;
      expect(check.validate(policy).errors).toEqual([]);
    });
  }
  test("a v2 policy is refused by the v1 schema, so an old reader fails closed", () => {
    expect(policyV1.validate(corpus.stages.chooses).valid).toBe(false);
  });
  for (const item of corpus.policyRelations) {
    test(`relation refused: ${item.name}`, () => {
      expect(policyV2.validate(item.policy).errors).toEqual([]);
      expect(() => relations(item.policy)).toThrow(item.refuse);
    });
  }
});

describe("narrowing vectors", () => {
  const cases = corpus.narrowing;
  test("every outcome is covered", () => {
    const outcomes = new Set(
      cases.map((c) => c.refuse ?? c.expect?.selection?.source ?? "fixed"),
    );
    expect([...outcomes].toSorted()).toEqual([
      "card",
      "default",
      "fixed",
      "needs-person",
      "no-primary",
      "primary-not-chosen",
      "repositories-not-canonical",
      "repository-not-allowed",
      "single",
    ]);
  });
  for (const item of cases) {
    test(item.name, () => {
      const stage = corpus.stages[item.stage];
      if (stage === undefined) throw new Error(`no stage ${item.stage}`);
      // Every refusal here is relational: each card is valid by schema alone.
      if (Object.keys(item.card).length)
        expect(cardSchema.validate(item.card).errors).toEqual([]);
      if (item.refuse !== undefined) {
        expect(item.expect).toBeUndefined();
        expect(() => narrow(stage, item.card)).toThrow(item.refuse);
        return;
      }
      const expected = item.expect;
      if (expected === undefined) throw new Error("a vector with no outcome");
      const result = narrow(stage, item.card);
      expect(result.policy).toEqual(expected.policy);
      expect(digest(result.policy)).toBe(expected.policyDigest);
      // The narrowed policy is a plain v1 policy: settlement and receipts are unchanged.
      expect(policyV1.validate(result.policy).errors).toEqual([]);
      if ("selection" in result) {
        expect(expected.selection).toEqual(result.selection);
        expect(selectionSchema.validate(result.selection).errors).toEqual([]);
        expect(result.policy.repositories.map((r) => r.name)).toEqual(
          result.selection.repositories,
        );
      } else {
        expect(expected.selection).toBeUndefined();
        expect(result.policy).toEqual(stage);
      }
    });
  }
});

test("producer-state cases stay explicitly unexecuted by schema validation", () => {
  expect(corpus.producer).toHaveLength(10);
  expect(new Set(corpus.producer.map((item) => item.name)).size).toBe(10);
  for (const item of corpus.producer)
    expect(item.scope).toBe(
      "producer-state assertions; not wire-only validation",
    );
});
