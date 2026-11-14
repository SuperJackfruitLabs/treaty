import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const schema = read("schemas/superbench/operation.v1.json");
const vectors: {
  valid: Record<string, unknown>;
  invalid: Array<{ name: string; body: unknown }>;
} = read("fixtures/superbench-api/operations.json");
const validator = new Validator(schema, "2020-12", false);

test("local API schema has its canonical data address", () => {
  expect(schema.$id).toBe(
    "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/schemas/superbench/operation.v1.json",
  );
});
for (const [name, body] of Object.entries(vectors.valid)) {
  test(`SuperBench request accepts ${name}`, () => {
    expect(validator.validate(body).errors).toEqual([]);
  });
}
for (const { name, body } of vectors.invalid) {
  test(`SuperBench request refuses ${name}`, () => {
    expect(validator.validate(body).valid).toBe(false);
  });
}
