/**
 * A small validator with the slice of zod's API the hub's wire modules used, so they moved here
 * unchanged in behaviour without a dependency. Internal to this package; not exported.
 *
 * It follows zod 4's semantics for every method it has:
 *
 * - `object` accepts a non-null, non-array object, strips keys it does not declare, and leaves a key
 *   out of its output when the input did not have it.
 * - `string` checks length in UTF-16 code units; `number` refuses NaN and ±Infinity; `int` takes a
 *   safe integer.
 * - `catch(v)` turns any failure into `v`; `optional` takes `undefined`; `nullish` also takes `null`.
 * - `transform` runs only after the base checks pass, and `refine` after it.
 */

export type Result<T> = { success: true; data: T } | { success: false };

const ok = <T>(data: T): Result<T> => ({ success: true, data });
const FAIL: Result<never> = { success: false };

export abstract class Schema<T> {
  declare readonly _output: T;
  /** Read `v`. */
  abstract run(v: unknown): Result<T>;
  /** Whether an object may leave this key out (zod's optional input). */
  get optionalKey(): boolean {
    return false;
  }

  safeParse(v: unknown): Result<T> {
    return this.run(v);
  }

  parse(v: unknown): T {
    const r = this.run(v);
    if (!r.success) throw new TypeError("invalid input");
    return r.data;
  }

  optional(): Schema<T | undefined> {
    return new Optional<T, T | undefined>(this, false);
  }

  nullish(): Schema<T | null | undefined> {
    return new Optional<T, T | null | undefined>(this, true);
  }

  catch<C>(fallback: C): Schema<T | C> {
    return new Catch(this, fallback);
  }

  transform<U>(fn: (v: T) => U): Schema<U> {
    return new Transform(this, fn);
  }

  refine(pred: (v: T) => boolean): Schema<T> {
    return new Transform(this, (v) => v, pred);
  }
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

export class Optional<T, U extends T | undefined | null> extends Schema<U> {
  constructor(
    readonly inner: Schema<T>,
    readonly nullable: boolean,
  ) {
    super();
  }
  override get optionalKey(): boolean {
    return true;
  }
  run(v: unknown): Result<U> {
    if (v === undefined) return ok(undefined as U);
    if (this.nullable && v === null) return ok(null as U);
    return this.inner.run(v) as Result<U>;
  }
}

export class Catch<T, C> extends Schema<T | C> {
  constructor(
    readonly inner: Schema<T>,
    readonly fallback: C,
  ) {
    super();
  }
  override get optionalKey(): boolean {
    return this.inner.optionalKey;
  }
  run(v: unknown): Result<T | C> {
    const r = this.inner.run(v);
    return r.success ? r : ok(this.fallback);
  }
}

export class Transform<T, U> extends Schema<U> {
  constructor(
    readonly inner: Schema<T>,
    readonly fn: (v: T) => U,
    readonly pred?: (v: U) => boolean,
  ) {
    super();
  }
  override get optionalKey(): boolean {
    return this.inner.optionalKey;
  }
  run(v: unknown): Result<U> {
    const r = this.inner.run(v);
    if (!r.success) return FAIL;
    const out = this.fn(r.data);
    if (this.pred && !this.pred(out)) return FAIL;
    return ok(out);
  }
}

export class StringSchema extends Schema<string> {
  constructor(readonly checks: ReadonlyArray<(v: string) => boolean> = []) {
    super();
  }
  run(v: unknown): Result<string> {
    if (typeof v !== "string") return FAIL;
    return this.checks.every((c) => c(v)) ? ok(v) : FAIL;
  }
  min(n: number): StringSchema {
    return new StringSchema([...this.checks, (v) => v.length >= n]);
  }
  max(n: number): StringSchema {
    return new StringSchema([...this.checks, (v) => v.length <= n]);
  }
  regex(re: RegExp): StringSchema {
    return new StringSchema([...this.checks, (v) => re.test(v)]);
  }
}

export class NumberSchema extends Schema<number> {
  constructor(readonly checks: ReadonlyArray<(v: number) => boolean> = []) {
    super();
  }
  run(v: unknown): Result<number> {
    if (typeof v !== "number" || !Number.isFinite(v)) return FAIL;
    return this.checks.every((c) => c(v)) ? ok(v) : FAIL;
  }
  int(): NumberSchema {
    return new NumberSchema([...this.checks, (v) => Number.isSafeInteger(v)]);
  }
  positive(): NumberSchema {
    return new NumberSchema([...this.checks, (v) => v > 0]);
  }
  nonnegative(): NumberSchema {
    return new NumberSchema([...this.checks, (v) => v >= 0]);
  }
  min(n: number): NumberSchema {
    return new NumberSchema([...this.checks, (v) => v >= n]);
  }
  /** zod 4 numbers are already finite; kept so the moved code reads as it did. */
  finite(): NumberSchema {
    return this;
  }
}

export class Of<T> extends Schema<T> {
  constructor(
    readonly test: (v: unknown) => v is T,
    readonly optional_ = false,
  ) {
    super();
  }
  override get optionalKey(): boolean {
    return this.optional_;
  }
  run(v: unknown): Result<T> {
    return this.test(v) ? ok(v) : FAIL;
  }
}

export class ArraySchema<T> extends Schema<T[]> {
  constructor(
    readonly item: Schema<T>,
    readonly checks: ReadonlyArray<(v: T[]) => boolean> = [],
  ) {
    super();
  }
  run(v: unknown): Result<T[]> {
    if (!Array.isArray(v)) return FAIL;
    const out: T[] = [];
    for (const x of v) {
      const r = this.item.run(x);
      if (!r.success) return FAIL;
      out.push(r.data);
    }
    return this.checks.every((c) => c(out)) ? ok(out) : FAIL;
  }
  min(n: number): ArraySchema<T> {
    return new ArraySchema(this.item, [...this.checks, (v) => v.length >= n]);
  }
  max(n: number): ArraySchema<T> {
    return new ArraySchema(this.item, [...this.checks, (v) => v.length <= n]);
  }
}

type Shape = Record<string, Schema<unknown>>;
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: undefined extends Infer<S[K]> ? K : never;
}[keyof S];
type ObjectOut<S extends Shape> = {
  [K in Exclude<keyof S, OptionalKeys<S>>]: Infer<S[K]>;
} & { [K in OptionalKeys<S>]?: Infer<S[K]> };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export class ObjectSchema<S extends Shape> extends Schema<ObjectOut<S>> {
  constructor(readonly shape: S) {
    super();
  }
  run(v: unknown): Result<ObjectOut<S>> {
    if (!isPlainObject(v)) return FAIL;
    const out: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(this.shape)) {
      const present = Object.prototype.hasOwnProperty.call(v, key);
      if (!present && schema.optionalKey) continue;
      const r = schema.run(v[key]);
      if (!r.success) return FAIL;
      if (present || r.data !== undefined) out[key] = r.data;
    }
    return ok(out as ObjectOut<S>);
  }
}

export class Union<T> extends Schema<T> {
  constructor(
    readonly key: string,
    readonly options: ReadonlyArray<ObjectSchema<Shape>>,
  ) {
    super();
  }
  run(v: unknown): Result<T> {
    if (!isPlainObject(v)) return FAIL;
    for (const option of this.options) {
      const tag = option.shape[this.key];
      if (tag && tag.run(v[this.key]).success)
        return option.run(v) as Result<T>;
    }
    return FAIL;
  }
}

const isString = (v: unknown): v is string => typeof v === "string";
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const isAnything = (_v: unknown): _v is unknown => true;

export const z = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new Of(isBoolean),
  /** zod 4 treats an `unknown` key as optional in an object. */
  unknown: () => new Of(isAnything, true),
  literal: <L extends string | number | boolean>(value: L) =>
    new Of((v: unknown): v is L => v === value),
  enum: <const E extends readonly string[]>(values: E) =>
    new Of((v: unknown): v is E[number] => isString(v) && values.includes(v)),
  array: <T>(item: Schema<T>) => new ArraySchema(item),
  object: <S extends Shape>(shape: S) => new ObjectSchema(shape),
  discriminatedUnion: <const O extends ReadonlyArray<ObjectSchema<Shape>>>(
    key: string,
    options: O,
  ): Schema<Infer<O[number]>> => new Union<Infer<O[number]>>(key, options),
};
