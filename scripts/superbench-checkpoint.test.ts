import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  semanticErrors,
  type Manifest,
} from "./superbench-checkpoint-validation";

const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const schema = read("schemas/superbench/checkpoint.v1.json");
const vectors: {
  version: string;
  valid: Array<{ name: string; body: Manifest }>;
  invalid: Array<{ name: string; reason: string; body: unknown }>;
} = read("fixtures/superbench-api/checkpoints.json");
const validator = new Validator(schema, "2020-12", false);
const isManifest = (body: unknown): body is Manifest =>
  validator.validate(body).valid;
const digest = (raw: Buffer) => createHash("sha256").update(raw).digest("hex");

test("checkpoint schema and independent corpus have explicit versions", () => {
  expect(schema.$id).toBe(
    "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/schemas/superbench/checkpoint.v1.json",
  );
  expect(vectors.version).toBe("superbench.checkpoint-fixtures.v1");
  const names = [...vectors.valid, ...vectors.invalid].map((item) => item.name);
  expect(new Set(names).size).toBe(names.length);
});

for (const { name, body } of vectors.valid) {
  test(`checkpoint accepts ${name}`, () => {
    expect(validator.validate(body).errors).toEqual([]);
    expect(semanticErrors(body)).toEqual([]);
  });
}

for (const { name, reason, body } of vectors.invalid) {
  test(`checkpoint refuses ${name} through ${reason}`, () => {
    const structural = validator.validate(body);
    if (reason === "schema") {
      expect(structural.valid).toBe(false);
    } else {
      // Semantic vectors must reach their guard: malformed structure alone
      // would not demonstrate sorted names, pin scope, or URL policy checks.
      expect(structural.errors).toEqual([]);
      if (!isManifest(body)) throw new Error("semantic vector failed schema");
      expect(semanticErrors(body)).toContain(reason);
    }
  });
}

test("manifest digest covers raw bytes externally without canonicalization", () => {
  const body = vectors.valid[0]?.body;
  if (!body) throw new Error("missing valid manifest fixture");
  const compact = Buffer.from(JSON.stringify(body));
  const spaced = Buffer.from(JSON.stringify(body, null, 2) + "\n");
  expect(JSON.parse(compact.toString())).toEqual(JSON.parse(spaced.toString()));
  expect(digest(compact)).not.toBe(digest(spaced));
  expect(Object.hasOwn(body, "digest")).toBe(false);
});
