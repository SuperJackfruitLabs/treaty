import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { casesFor } from "../packages/contracts/src/cases.ts";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { readRegistry } from "../packages/contracts/src/registry.ts";
import { validatorFor } from "../packages/contracts/src/schemas.ts";

const root = join(import.meta.dir, "..");
const RAW = "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
const bundle = loadBundle(root);
const registry = readRegistry(bundle);

function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
}

const schemas = walk("schemas/supertoolkit")
  .filter((p) => p.endsWith(".json"))
  .toSorted();
const named = new Map(
  registry.crossings.flatMap((c) => Object.entries(c.cases ?? {})),
);

describe("schemas/supertoolkit", () => {
  test("every schema is named by a crossing, with its cases", () => {
    expect(schemas.filter((p) => !named.has(p))).toEqual([]);
  });

  for (const path of schemas) {
    const schema: unknown = bundle.files.get(path);
    const cases = casesFor(bundle, registry, path);
    const validate = validatorFor(bundle, path);

    test(`${path}: its $id is where it is published`, () => {
      expect(
        schema !== null && typeof schema === "object"
          ? Reflect.get(schema, "$id")
          : undefined,
      ).toBe(`${RAW}${path}`);
    });

    test(`${path}: has valid and invalid cases`, () => {
      expect(Object.keys(cases?.valid ?? {}).length).toBeGreaterThan(0);
      expect(cases?.invalid.length ?? 0).toBeGreaterThan(0);
    });

    for (const [label, body] of Object.entries(cases?.valid ?? {})) {
      test(`${path} accepts ${label}`, () => {
        expect(validate(body).errors).toEqual([]);
      });
    }
    for (const { why, body } of cases?.invalid ?? []) {
      test(`${path} refuses: ${why}`, () => {
        expect(validate(body).valid).toBe(false);
      });
    }
  }
});

describe("contracts/supertoolkit/builtin-services.json", () => {
  const PATH = "contracts/supertoolkit/builtin-services.json";
  const list: unknown = bundle.files.get(PATH);
  const services: unknown =
    list !== null && typeof list === "object"
      ? Reflect.get(list, "services")
      : undefined;
  const names = (Array.isArray(services) ? services : []).map((s: unknown) =>
    s !== null && typeof s === "object" ? Reflect.get(s, "name") : undefined,
  );

  test("validates against schemas/treaty/builtin-services.v1.json", () => {
    const validate = validatorFor(
      bundle,
      "schemas/treaty/builtin-services.v1.json",
    );
    expect(validate(list).errors).toEqual([]);
  });

  test("a list naming one service twice is refused", () => {
    const validate = validatorFor(
      bundle,
      "schemas/treaty/builtin-services.v1.json",
    );
    const doubled = {
      ...Object(list),
      services: [{ name: "github" }, { name: "github" }],
    };
    expect(validate(doubled).valid).toBe(false);
  });

  test("names are sorted", () => {
    expect(names).toEqual(
      names.map(String).toSorted((a, b) => a.localeCompare(b, "en")),
    );
  });

  test("holds stk's approvals services, which AgentPod's own list lacked", () => {
    expect(names).toContain("superpipeline-approvals-read");
    expect(names).toContain("superpipeline-approvals-write");
  });

  test("the policy schema refuses a forge service under exactly these names", () => {
    const policy: unknown = bundle.files.get(
      "schemas/supertoolkit/policy.v1.json",
    );
    const patterns: unknown = Reflect.get(
      Object(
        Reflect.get(
          Object(Reflect.get(Object(policy), "properties")),
          "services",
        ),
      ),
      "patternProperties",
    );
    const keys = Object.keys(Object(patterns));
    expect(keys.length).toBe(1);
    const alternatives = (keys[0] ?? "")
      .replace(/^\^\(/, "")
      .replace(/\)\$$/, "")
      .split("|");
    expect(alternatives).toEqual(names);
  });

  test("the policy refuses a forge entry under every built-in name", () => {
    const validate = validatorFor(
      bundle,
      "schemas/supertoolkit/policy.v1.json",
    );
    const entry = {
      kind: "forge",
      provider: "forgejo",
      host: "forge.example.com",
      repositories: ["acme/widgets"],
    };
    const accepted = names.filter(
      (n) =>
        validate({ services: { [String(n)]: entry } }).valid ||
        !validate({ services: { [`${String(n)}-forge`]: entry } }).valid,
    );
    expect(accepted).toEqual([]);
  });
});

/**
 * Corpora moved from supertoolkit's testdata unchanged (supertoolkit 12a7b81). Their bytes are
 * the contract: each side checks its copy against treaty's, so an edit here is a change to both.
 */
describe("fixtures/supertoolkit corpora", () => {
  const pinned: Record<string, string> = {
    "fixtures/supertoolkit/handover-v1.json":
      "6cd45a71c3639c63dea0a092907273cc2e57b05f04e86d23e4c98164deb49e62",
    "fixtures/supertoolkit/managed-mcp-v1.json":
      "ec6d9499af358a942046dc89cd7683b8217417f479c8ae9c1efc88a06142d789",
    "fixtures/supertoolkit/managed-control-v1.json":
      "fc878c1280208a365a01d5e98c1c8575afcd607635bb43813f8d0475733b0c7e",
  };
  for (const [path, sha256] of Object.entries(pinned)) {
    test(`${path} is byte for byte stk's corpus`, () => {
      expect(
        createHash("sha256")
          .update(readFileSync(join(root, path)))
          .digest("hex"),
      ).toBe(sha256);
    });
    test(`${path} belongs to a crossing`, () => {
      expect(
        registry.crossings.filter((c) => c.contract.includes(path)).length,
      ).toBe(1);
    });
  }

  test("the handover corpus opens to its material with its own key pair", () => {
    const corpus: unknown = bundle.files.get(
      "fixtures/supertoolkit/handover-v1.json",
    );
    const field = (k: string): unknown => Reflect.get(Object(corpus), k);
    expect(String(field("public_key"))).toStartWith("stk-handover-v1:");
    expect(String(field("envelope"))).toStartWith("stk-handover-v1:");
    expect(typeof field("private_key")).toBe("string");
    expect(typeof field("material")).toBe("object");
  });

  test("the handover corpus's key is a valid `stk handover key --json`", () => {
    const corpus: unknown = bundle.files.get(
      "fixtures/supertoolkit/handover-v1.json",
    );
    const validate = validatorFor(
      bundle,
      "schemas/supertoolkit/cli/handover-key.v1.json",
    );
    expect(
      validate({ public_key: Reflect.get(Object(corpus), "public_key") })
        .errors,
    ).toEqual([]);
  });
});

const statusOf = (id: string): string | undefined =>
  registry.crossings.find((c) => c.id === id)?.status;

describe("the registry splits supertoolkit by what runs (phase 4, ruling 4)", () => {
  test("the CLI and the hand-over are contracted; the managed protocols are proposed", () => {
    expect([
      statusOf("supertoolkit.cli"),
      statusOf("supertoolkit.handover"),
      statusOf("supertoolkit.managed"),
    ]).toEqual(["contracted", "contracted", "proposed"]);
  });
});
