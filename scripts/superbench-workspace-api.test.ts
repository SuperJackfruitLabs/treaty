import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  strictDecode,
  workspaceErrors,
  type WorkspaceRequest,
} from "./superbench-workspace-api-validation";

const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const schema = read("schemas/superbench/operation.v2.json");
const validator = new Validator(schema, "2020-12", false);
const isRequest = (body: unknown): body is WorkspaceRequest =>
  validator.validate(body).valid;
const vectors: {
  version: string;
  valid: Array<{ name: string; body: WorkspaceRequest }>;
  invalid: Array<{ name: string; reason: string; body: unknown }>;
  lexical: Array<{ name: string; reason: string; raw: string }>;
} = read("fixtures/superbench-api/workspace-operations.json");

test("proposed workspace requests use a separate version and canonical address", () => {
  expect(schema.$id).toBe(
    "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/schemas/superbench/operation.v2.json",
  );
  expect(vectors.version).toBe("superbench.workspace-operations-fixtures.v1");
  const names = [...vectors.valid, ...vectors.invalid, ...vectors.lexical].map(
    (item) => item.name,
  );
  expect(new Set(names).size).toBe(names.length);
});

for (const { name, body } of vectors.valid) {
  test(`workspace request accepts ${name}`, () => {
    expect(validator.validate(body).errors).toEqual([]);
    expect(workspaceErrors(body)).toEqual([]);
    expect(strictDecode(JSON.stringify(body))).toEqual(body);
  });
}
for (const { name, reason, body } of vectors.invalid) {
  test(`workspace request refuses ${name} through ${reason}`, () => {
    if (reason === "schema") expect(validator.validate(body).valid).toBe(false);
    else {
      expect(validator.validate(body).errors).toEqual([]);
      if (!isRequest(body)) throw new Error("semantic vector failed schema");
      expect(workspaceErrors(body)).toContain(reason);
    }
  });
}
for (const { name, reason, raw } of vectors.lexical) {
  test(`workspace decoder refuses ${name}`, () => {
    if (reason === "duplicate_key")
      expect(() => strictDecode(raw)).toThrow("duplicate_key");
    else expect(() => strictDecode(raw)).toThrow();
  });
}

test("request byte budget precedes schema and receipt processing", () => {
  const body = JSON.stringify({
    version: "superbench.v2",
    operation: "status",
  });
  const exact = body + " ".repeat((64 << 10) - body.length);
  expect(strictDecode(exact)).toEqual(JSON.parse(body));
  expect(() => strictDecode(exact + " ")).toThrow("request_size");
});
