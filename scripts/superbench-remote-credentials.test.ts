import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
type Cases = {
  valid: Record<string, unknown>;
  invalid: Array<{ name: string; body: unknown }>;
};
const fixture: { request: Cases; response: Cases } = read(
  "fixtures/superbench-api/remote-credentials.json",
);
const sets: Array<[string, string, Cases]> = [
  [
    "request",
    "schemas/superbench/remote-credential-request.v1.json",
    fixture.request,
  ],
  [
    "response",
    "schemas/superbench/remote-credential-response.v1.json",
    fixture.response,
  ],
];

for (const [label, path, cases] of sets) {
  const schema = read(path);
  const validator = new Validator(schema, "2020-12", false);
  test(`remote credential ${label} schema has its canonical data address`, () => {
    expect(schema.$id).toBe(
      `https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/${path}`,
    );
  });
  for (const [name, body] of Object.entries(cases.valid)) {
    test(`remote credential ${label} accepts ${name}`, () => {
      expect(validator.validate(body).errors).toEqual([]);
    });
  }
  for (const { name, body } of cases.invalid) {
    test(`remote credential ${label} refuses ${name}`, () => {
      expect(validator.validate(body).valid).toBe(false);
    });
  }
}
