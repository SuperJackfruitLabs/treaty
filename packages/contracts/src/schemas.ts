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
  for (const [path, doc] of bundle.files) {
    if (!path.startsWith("schemas/") || !isObject(doc)) continue;
    const id = typeof doc.$id === "string" ? doc.$id : idOf(path);
    validator.addSchema(doc, id);
  }
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
