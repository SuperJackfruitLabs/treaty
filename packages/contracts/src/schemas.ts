/**
 * A bundle of treaty's files, and validators over them that never reach the network.
 *
 * Pure: no filesystem, so it runs in Workers. `node.ts` loads a bundle from disk.
 */
import { Validator, type Schema } from "@cfworker/json-schema";

/** Where treaty's files are published. Every schema's `$id` starts here. */
export const SCHEMA_BASE =
  "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/" as const;

export interface Bundle {
  /** Repository path → parsed JSON, for every file in schemas/, fixtures/ and contracts/. */
  readonly files: ReadonlyMap<string, unknown>;
  /** Validators already built, by reference. */
  readonly cache: Map<string, (value: unknown) => Result>;
}

export interface Result {
  valid: boolean;
  errors: string[];
}

export function createBundle(
  files: Record<string, unknown> | ReadonlyMap<string, unknown>,
): Bundle {
  const map =
    files instanceof Map
      ? new Map<string, unknown>(files)
      : new Map(Object.entries(files));
  return { files: map, cache: new Map() };
}

/** The address a file is published at, which is also its `$id` when it is a schema. */
export function idOf(path: string): string {
  return `${SCHEMA_BASE}${path}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Encodes a JSON pointer for use as a URI fragment (RFC 6901 §6). */
export function fragment(pointer: string): string {
  return pointer
    .split("/")
    .map((token) => encodeURIComponent(token))
    .join("/");
}

function register(bundle: Bundle, validator: Validator): void {
  const seen = new Set<string>();
  for (const [path, doc] of bundle.files) {
    if (!path.startsWith("schemas/") || !isObject(doc)) continue;
    const id = typeof doc.$id === "string" ? doc.$id : idOf(path);
    // A copied schema that kept its original's $id would make the validator throw. The first
    // wins here; misplacedIds() reports the copy.
    if (seen.has(id)) continue;
    seen.add(id);
    validator.addSchema(doc, id);
  }
}

/**
 * The validator indexes a document's subschemas by walking its objects, but not its arrays, so a
 * pointer through an array (an OpenAPI parameter, `parameters/0/schema`) would not resolve.
 * Registering the node the pointer reaches, under its full address, makes any pointer resolve;
 * its own relative `$ref`s still resolve against the document.
 */
function registerAt(
  bundle: Bundle,
  validator: Validator,
  where: string,
  base: string,
  pointer: string,
): void {
  const path = where.startsWith(SCHEMA_BASE)
    ? where.slice(SCHEMA_BASE.length)
    : where;
  let node: unknown = bundle.files.get(path);
  let throughArray = false;
  for (const raw of pointer.slice(1).split("/")) {
    const t = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(node)) {
      throughArray = true;
      node = node[Number(t)];
    } else node = isObject(node) ? node[t] : undefined;
  }
  // Only a pointer through an array needs this; the walk already indexes every other subschema.
  if (!throughArray || !isObject(node)) return;
  try {
    validator.addSchema(anchored(node, base), `${base}#${fragment(pointer)}`);
  } catch {
    // Already indexed by the walk: nothing to add.
  }
}

/**
 * A copy of a node with every fragment-only `$ref` (`#/$defs/x`) made absolute against its
 * document. Registered under an address with a fragment, the node has no base of its own, so a
 * relative `$ref` inside it would resolve against nothing. (A nested `$id` is not followed: no
 * contract here uses one.)
 */
function anchoredValue(value: unknown, base: string): unknown {
  if (Array.isArray(value)) return value.map((v) => anchoredValue(v, base));
  return isObject(value) ? anchored(value, base) : value;
}

function anchored(
  node: Record<string, unknown>,
  base: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node))
    out[key] =
      key === "$ref" && typeof value === "string" && value.startsWith("#")
        ? `${base}${value}`
        : anchoredValue(value, base);
  return out;
}

/** Schemas whose `$id` is not the address of their own path: each is a copy or a move gone wrong. */
export function misplacedIds(bundle: Bundle): string[] {
  const wrong: string[] = [];
  for (const [path, doc] of bundle.files) {
    if (!path.startsWith("schemas/") || !isObject(doc)) continue;
    if (typeof doc.$id === "string" && doc.$id !== idOf(path))
      wrong.push(`${path} has $id ${doc.$id}`);
  }
  return wrong;
}

function flatten(
  errors: { instanceLocation: string; keyword: string; error: string }[],
): string[] {
  // The validator reports every enclosing keyword too ("A subschema had errors."); the leaves
  // are the ones that say what is wrong.
  const leaves = errors.filter(
    (e) =>
      !/subschema|property .* does not match|items did not match/i.test(
        e.error,
      ),
  );
  return (leaves.length > 0 ? leaves : errors).map(
    (e) => `${e.instanceLocation} ${e.error}`,
  );
}

/**
 * A validator for one schema. `ref` is a repository path (`schemas/common/error.v1.json`), a
 * path with a JSON pointer (`schemas/http/x.openapi.json#/components/schemas/Card`), or a
 * schema's full `$id`.
 */
export function validatorFor(
  bundle: Bundle,
  ref: string,
): (value: unknown) => Result {
  const cached = bundle.cache.get(ref);
  if (cached) return cached;
  const [where = "", pointer] = ref.split("#");
  const base = where.startsWith("https://") ? where : idOf(where);
  const target: Schema = {
    $ref: pointer === undefined ? base : `${base}#${fragment(pointer)}`,
  };
  const validator = new Validator(target, "2020-12", false);
  register(bundle, validator);
  if (pointer !== undefined)
    registerAt(bundle, validator, where, base, pointer);
  const check = (value: unknown): Result => {
    try {
      const result = validator.validate(value);
      return { valid: result.valid, errors: flatten(result.errors) };
    } catch (error) {
      // An unresolved $ref throws inside the validator. A contract that cannot be read is a
      // refusal, never a crash in the caller.
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  };
  bundle.cache.set(ref, check);
  return check;
}
