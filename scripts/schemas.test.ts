import { describe, expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseType } from "../packages/cloudevents/src/index.ts";

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
