/**
 * Refuses a change that would break a reader or a writer within a version.
 *
 *   bun scripts/compat.ts [--base <git ref>] [--root <repository>]
 *
 * Compares every file under schemas/ between the base ref (default: the merge base with
 * origin/main) and the working tree, by structure and by corpus: each side's valid cases must
 * validate under the other side's schema. A breaking change passes only with an entry in
 * contracts/compat-exceptions.json, and an exception that matches nothing fails as stale.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  casesFor,
  isCases,
  type Cases,
} from "../packages/contracts/src/cases.ts";
import {
  compareOpenApi,
  compareSchemas,
} from "../packages/contracts/src/compat.ts";
import { operations } from "../packages/contracts/src/http.ts";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { casesPathFor } from "../packages/contracts/src/openapi-check.ts";
import {
  isRegistryShape,
  type Registry,
} from "../packages/contracts/src/registry.ts";
import {
  createBundle,
  validatorFor,
  type Bundle,
} from "../packages/contracts/src/schemas.ts";

export interface Finding {
  path: string;
  pointer: string;
  rule: string;
}

interface Exception {
  path: string;
  rule?: string;
  reason: string;
  /** The release the change breaks against. Once compat compares with another base, the entry no longer applies. */
  against?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
}

/** Every JSON file under schemas/, fixtures/ and contracts/ at a ref. */
export function bundleAt(root: string, ref: string): Bundle {
  const files = new Map<string, unknown>();
  // -z: paths are NUL-separated and never quoted, so a non-ASCII name is read as it is.
  const listed = git(root, [
    "ls-tree",
    "-r",
    "-z",
    "--name-only",
    ref,
    "--",
    "schemas",
    "fixtures",
    "contracts",
  ]);
  for (const path of listed.split("\0").filter((p) => p.endsWith(".json")))
    files.set(path, JSON.parse(git(root, ["show", `${ref}:${path}`])));
  return createBundle(files);
}

/** The commit `ref` names, or undefined. `--end-of-options` keeps a ref from being read as a flag. */
function commitOf(root: string, ref: string): string | undefined {
  try {
    return (
      git(root, [
        "rev-parse",
        "--verify",
        "--quiet",
        "--end-of-options",
        `${ref}^{commit}`,
      ]).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

function registryOf(bundle: Bundle): Registry | undefined {
  const value = bundle.files.get("contracts/registry.json");
  return isRegistryShape(value) ? value : undefined;
}

const isOpenApi = (doc: unknown) =>
  isObject(doc) && typeof doc.openapi === "string";

function corpus(
  path: string,
  pointer: string,
  fromCases: Cases | undefined,
  under: (value: unknown) => { valid: boolean },
  rule: string,
  out: Finding[],
): void {
  for (const [label, body] of Object.entries(fromCases?.valid ?? {}))
    if (!under(body).valid)
      out.push({ path, pointer, rule: `${rule}: ${label}` });
}

function catalogTypes(bundle: Bundle): Set<string> {
  const catalog = bundle.files.get("schemas/catalog.json");
  const events =
    isObject(catalog) && Array.isArray(catalog.events) ? catalog.events : [];
  return new Set(
    events.flatMap((e: unknown) =>
      isObject(e) && typeof e.type === "string"
        ? [`${e.type} ${String(e.dataschema)}`]
        : [],
    ),
  );
}

function apiCases(
  bundle: Bundle,
  docPath: string,
  operationId: string,
  part: string,
): Cases | undefined {
  const file = bundle.files.get(casesPathFor(docPath));
  const op =
    isObject(file) && isObject(file.operations)
      ? file.operations[operationId]
      : undefined;
  if (!isObject(op)) return undefined;
  const node =
    part === "request"
      ? op.request
      : isObject(op.responses)
        ? op.responses[part]
        : undefined;
  return isCases(node) ? node : undefined;
}

/** Breaking changes from `base` to `head`. */
export function compare(base: Bundle, head: Bundle): Finding[] {
  const out: Finding[] = [];
  const baseRegistry = registryOf(base);
  const headRegistry = registryOf(head);

  for (const [path, before] of base.files) {
    if (!path.startsWith("schemas/")) continue;
    const after = head.files.get(path);
    if (path === "schemas/catalog.json") {
      const kept = catalogTypes(head);
      for (const entry of catalogTypes(base))
        if (!kept.has(entry))
          out.push({
            path,
            pointer: "",
            rule: `catalog-event-removed: ${entry.split(" ")[0]}`,
          });
      continue;
    }
    // Every other file under schemas/ is a schema, whether or not it says so with $schema.
    if (after === undefined) {
      out.push({ path, pointer: "", rule: "schema-removed" });
      continue;
    }
    if (isOpenApi(before)) {
      for (const b of compareOpenApi(before, after)) out.push({ path, ...b });
      const headOps = new Map(operations(after).map((o) => [o.id, o]));
      for (const baseOp of operations(before)) {
        const headOp = headOps.get(baseOp.id);
        if (!headOp) continue;
        const parts: [
          string,
          string | null | undefined,
          string | null | undefined,
        ][] = [
          ["request", baseOp.request, headOp.request],
          ...Object.keys(baseOp.responses).map(
            (
              s,
            ): [
              string,
              string | null | undefined,
              string | null | undefined,
            ] => [s, baseOp.responses[s], headOp.responses[s]],
          ),
        ];
        for (const [part, basePtr, headPtr] of parts) {
          if (!basePtr || !headPtr) continue;
          corpus(
            path,
            headPtr,
            apiCases(base, path, baseOp.id, part),
            validatorFor(head, `${path}#${headPtr}`),
            `old-case-refused ${baseOp.id} ${part}`,
            out,
          );
          corpus(
            path,
            headPtr,
            apiCases(head, path, baseOp.id, part),
            validatorFor(base, `${path}#${basePtr}`),
            `new-case-refused-by-old ${baseOp.id} ${part}`,
            out,
          );
        }
      }
      continue;
    }
    for (const b of compareSchemas(before, after)) out.push({ path, ...b });
    corpus(
      path,
      "",
      casesFor(base, baseRegistry, path),
      validatorFor(head, path),
      "old-case-refused",
      out,
    );
    corpus(
      path,
      "",
      casesFor(head, headRegistry, path),
      validatorFor(base, path),
      "new-case-refused-by-old",
      out,
    );
  }
  return out;
}

export interface Outcome {
  breaking: Finding[];
  excused: Finding[];
  stale: Exception[];
}

export function judge(findings: Finding[], exceptions: Exception[]): Outcome {
  const matches = (e: Exception, f: Finding) =>
    e.path === f.path &&
    (e.rule === undefined ||
      f.rule === e.rule ||
      f.rule.startsWith(`${e.rule}:`));
  return {
    breaking: findings.filter((f) => !exceptions.some((e) => matches(e, f))),
    excused: findings.filter((f) => exceptions.some((e) => matches(e, f))),
    stale: exceptions.filter((e) => !findings.some((f) => matches(e, f))),
  };
}

function exceptionsIn(root: string): Exception[] {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(root, "contracts/compat-exceptions.json"), "utf8"),
    );
    const list =
      isObject(parsed) && Array.isArray(parsed.exceptions)
        ? parsed.exceptions
        : [];
    return list.flatMap((e: unknown) =>
      isObject(e) && typeof e.path === "string" && typeof e.reason === "string"
        ? [
            {
              path: e.path,
              reason: e.reason,
              ...(typeof e.rule === "string" ? { rule: e.rule } : {}),
              ...(typeof e.against === "string" ? { against: e.against } : {}),
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}

/** The latest release tag (vX.Y.Z) HEAD's history holds, or undefined. */
function latestRelease(root: string): string | undefined {
  try {
    return (
      git(root, [
        "describe",
        "--tags",
        "--abbrev=0",
        "--match",
        "v[0-9]*",
        "HEAD",
      ]).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (import.meta.main) {
  const root = arg("--root") ?? join(import.meta.dir, "..");
  const asked = arg("--base");
  // What can break is what a consumer pins: a release. By default compare with the latest
  // release tag HEAD descends from, so a contract added and changed again between two releases
  // is never called breaking, and anything a release holds always is.
  const release = asked === undefined ? latestRelease(root) : undefined;
  const base =
    asked !== undefined
      ? commitOf(root, asked)
      : release && commitOf(root, release);
  const label = asked ?? release;
  if (!base) {
    process.stderr.write(
      asked !== undefined
        ? `compat: --base ${JSON.stringify(asked)} is not a commit in this repository\n`
        : "compat: no release tag (v*) in HEAD's history; fetch the tags, or pass --base <commit>\n",
    );
    process.exit(2);
  }
  const all = exceptionsIn(root);
  const active = all.filter(
    (e) => e.against === undefined || e.against === label,
  );
  for (const e of all.filter((x) => !active.includes(x)))
    console.log(
      `expired   contracts/compat-exceptions.json: ${e.path} (against ${e.against}); remove it`,
    );
  const outcome = judge(
    compare(bundleAt(root, base), loadBundle(root)),
    active,
  );
  for (const f of outcome.breaking)
    console.log(
      `breaking  ${f.path}${f.pointer ? `#${f.pointer}` : ""}  ${f.rule}`,
    );
  for (const f of outcome.excused)
    console.log(
      `excused   ${f.path}${f.pointer ? `#${f.pointer}` : ""}  ${f.rule}`,
    );
  for (const e of outcome.stale)
    console.log(
      `stale     contracts/compat-exceptions.json: ${e.path}${e.rule ? ` ${e.rule}` : ""} matches no change`,
    );
  console.log(
    `compat: ${outcome.breaking.length} breaking, ${outcome.excused.length} excused, ${outcome.stale.length} stale exceptions (against ${label === base ? base.slice(0, 12) : `${label}, ${base.slice(0, 12)}`})`,
  );
  process.exit(outcome.breaking.length > 0 || outcome.stale.length > 0 ? 1 : 0);
}
