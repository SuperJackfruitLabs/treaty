import { describe, expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  PRODUCTS,
  coverage,
  type Registry,
} from "../packages/contracts/src/registry.ts";

const root = join(import.meta.dir, "..");
const read = (path: string): unknown =>
  JSON.parse(readFileSync(join(root, path), "utf8"));
const registrySchema = new Validator(
  JSON.parse(
    readFileSync(join(root, "schemas/treaty/registry.v1.json"), "utf8"),
  ),
  "2020-12",
  false,
);
function isRegistry(value: unknown): value is Registry {
  return registrySchema.validate(value).valid;
}
const loaded = read("contracts/registry.json");
if (!isRegistry(loaded)) throw new Error("contracts/registry.json is invalid");
const registry: Registry = loaded;

function hasCases(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false;
  if (!("valid" in node) || !("invalid" in node)) return false;
  return (
    typeof node.valid === "object" &&
    node.valid !== null &&
    Array.isArray(node.invalid)
  );
}

function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
}

/** Follows a JSON pointer (RFC 6901) into a parsed document. */
function pointer(doc: unknown, ptr: string): unknown {
  if (ptr === "" || ptr === "/") return doc;
  return ptr
    .slice(1)
    .split("/")
    .map((t) => t.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>(
      (node, token) =>
        node !== null && typeof node === "object"
          ? Reflect.get(node, token)
          : undefined,
      doc,
    );
}

describe("contracts/registry.json", () => {
  test("validates against schemas/treaty/registry.v1.json", () => {
    expect(registrySchema.validate(loaded).errors).toEqual([]);
  });

  test("ids are unique", () => {
    const ids = registry.crossings.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  test("an id starts with its owner", () => {
    const wrong = registry.crossings
      .filter((c) => !c.id.startsWith(`${c.owner}.`))
      .map((c) => c.id);
    expect(wrong).toEqual([]);
  });

  test("an owner is never among its own consumers", () => {
    const wrong = registry.crossings
      .filter((c) => c.consumers.includes(c.owner))
      .map((c) => c.id);
    expect(wrong).toEqual([]);
  });

  test("every contract path exists", () => {
    const missing = registry.crossings.flatMap((c) =>
      c.contract.filter((p) => !existsSync(join(root, p))),
    );
    expect(missing).toEqual([]);
  });

  test("every evidence names a product repository", () => {
    const products: readonly string[] = PRODUCTS;
    const wrong = registry.crossings.flatMap((c) =>
      c.evidence.filter((e) => !products.includes(e.split(":")[0] ?? "")),
    );
    expect(wrong).toEqual([]);
  });

  test("every cases entry is a contract schema and points at valid and invalid cases", () => {
    const problems: string[] = [];
    for (const c of registry.crossings) {
      for (const [schema, location] of Object.entries(c.cases ?? {})) {
        if (!c.contract.includes(schema))
          problems.push(`${c.id}: ${schema} is not in its contract`);
        const [file = "", ptr = ""] = location.split("#");
        if (!hasCases(pointer(read(file), ptr)))
          problems.push(`${c.id}: ${location} has no valid and invalid cases`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("every schema file is named by a crossing", () => {
    // schemas/treaty/ describes treaty's own files, and schemas/common/ holds pieces other
    // schemas reference; neither is a crossing of its own.
    const named = new Set(registry.crossings.flatMap((c) => c.contract));
    const unnamed = walk("schemas")
      .filter((p) => p.endsWith(".json"))
      .filter((p) => !/^schemas\/(treaty|common)\//.test(p))
      .filter((p) => !named.has(p));
    expect(unnamed).toEqual([]);
  });

  test("every catalogued event's schema belongs to an event crossing", () => {
    const catalog = read("schemas/catalog.json");
    const events =
      catalog !== null && typeof catalog === "object" && "events" in catalog
        ? catalog.events
        : [];
    const dataschemas = (Array.isArray(events) ? events : []).flatMap(
      (e: unknown) =>
        e !== null &&
        typeof e === "object" &&
        "dataschema" in e &&
        typeof e.dataschema === "string"
          ? [e.dataschema]
          : [],
    );
    const base =
      "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
    const eventPaths = new Set(
      registry.crossings
        .filter((c) => c.kind === "event")
        .flatMap((c) => c.contract),
    );
    const orphans = dataschemas
      .map((d) => relative("", d.replace(base, "")))
      .filter((p) => !eventPaths.has(p));
    expect(orphans).toEqual([]);
  });

  describe("contracts/artifacts/", () => {
    const artifactSchema = new Validator(
      JSON.parse(
        readFileSync(join(root, "schemas/treaty/artifact.v1.json"), "utf8"),
      ),
      "2020-12",
      false,
    );
    const records = walk("contracts/artifacts").filter((p) =>
      p.endsWith(".json"),
    );

    test("SuperLibrary's embed is recorded by version and hash (phase 3, ruling 7)", () => {
      const api = registry.crossings.find((c) => c.id === "superlibrary.api");
      expect(api?.contract).toContain(
        "contracts/artifacts/superlibrary-embed.json",
      );
    });

    /** The fields a record must have to be matched with its crossing. */
    function isRecord(
      value: unknown,
    ): value is { artifact: string; crossing: string; owner: string } {
      return (
        artifactSchema.validate(value).valid &&
        value !== null &&
        typeof value === "object" &&
        "artifact" in value &&
        "crossing" in value &&
        "owner" in value
      );
    }

    for (const path of records) {
      test(`${path} is an artifact record its crossing lists`, () => {
        const record = read(path);
        expect(artifactSchema.validate(record).errors).toEqual([]);
        if (!isRecord(record)) throw new Error(`${path} is not a record`);
        expect(path).toBe(`contracts/artifacts/${record.artifact}.json`);
        const crossing = registry.crossings.find(
          (c) => c.id === record.crossing,
        );
        expect(String(crossing?.owner)).toBe(record.owner);
        expect(crossing?.contract).toContain(path);
      });
    }

    test("a record whose hash is not a SHA-256 is refused", () => {
      const record = read("contracts/artifacts/superlibrary-embed.json");
      const broken = {
        ...Object(record),
        files: { "superlibrary-embed.js": "a5ae922b" },
      };
      expect(artifactSchema.validate(record).valid).toBe(true);
      expect(artifactSchema.validate(broken).valid).toBe(false);
    });
  });

  test("the coverage of the registry is recorded here, so a change to it is a visible diff", () => {
    expect(coverage(registry)).toEqual({
      applicable: 32,
      byStatus: {
        contracted: 27,
        partial: 1,
        uncontracted: 1,
        proposed: 2,
        external: 1,
        standard: 2,
        deprecated: 2,
      },
      percent: 84,
    });
  });
});

describe("coverage", () => {
  test("counts standard and deprecated crossings out of what applies", () => {
    const one = registry.crossings[0];
    if (!one) throw new Error("the registry is empty");
    const r: Registry = {
      ...registry,
      crossings: [
        { ...one, status: "contracted" },
        { ...one, status: "uncontracted" },
        { ...one, status: "standard" },
        { ...one, status: "deprecated" },
      ],
    };
    expect(coverage(r).applicable).toBe(2);
    expect(coverage(r).percent).toBe(50);
  });

  test("an empty registry is fully covered", () => {
    expect(coverage({ ...registry, crossings: [] }).percent).toBe(100);
  });
});
