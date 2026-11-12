/** The invalid cases derived from a valid one by breaking one rule. */

import type { Examples } from "./types.ts";

/**
 * Invalid cases made from a valid one by breaking one rule, for the rules no source case breaks.
 * Taken from the first valid case that has what the rule is about, so they track the builders.
 */
export function derivedInvalid(out: Examples): void {
  const bad = (type: string, why: string, body: unknown) =>
    (out[type] ??= { valid: {}, invalid: [] }).invalid.push({
      why,
      refusedBy: "schema",
      body,
    });
  const firstValid = (
    type: string,
    has: (c: Record<string, unknown>) => boolean,
  ): Record<string, unknown> => {
    const found = Object.values(out[type]?.valid ?? {}).find(
      (c): c is Record<string, unknown> =>
        typeof c === "object" &&
        c !== null &&
        has(c as Record<string, unknown>),
    );
    if (!found) throw new Error(`no valid ${type} case to derive from`);
    return found;
  };
  const subjectOf = (c: Record<string, unknown>) =>
    typeof c.subject === "object" && c.subject !== null
      ? (c.subject as Record<string, unknown>)
      : null;

  for (const type of [
    "dev.superpipeline.gate.v2",
    "dev.superpipeline.question.v2",
    "dev.superpipeline.delivery.v2",
    "dev.agentpod.permission.v2",
  ]) {
    const c = firstValid(
      type,
      (v) => typeof subjectOf(v)?.revision === "number",
    );
    bad(type, "a subject revision that is not a whole number", {
      ...c,
      subject: { ...subjectOf(c), revision: 1.5 },
    });
  }

  // `subject.expires_at` is RFC 3339 with seconds and an offset. The first four are refused by
  // `format` and the pattern alike; the next three only by the pattern (a validator's date-time
  // format allows them); the last only by `format` (the pattern cannot count a month's days).
  const looseExpiries: Array<[string, string]> = [
    ["2030-01-02", "an expiry that is a date only"],
    ["Jan 2 2030", "an expiry written as a person would"],
    ["2030-01-02T03:04:05", "an expiry with no offset"],
    ["2030-01-02T03:04Z", "an expiry with no seconds"],
    ["2030-01-02 03:04:05Z", "an expiry with a space for the T"],
    ["2030-01-02T03:04:05+0530", "an expiry whose offset has no colon"],
    ["2030-01-02t03:04:05z", "an expiry in lower case"],
    ["2030-02-30T03:04:05Z", "an expiry on a day the month does not have"],
  ];
  for (const type of [
    "dev.superpipeline.gate.v2",
    "dev.superpipeline.question.v2",
    "dev.superpipeline.delivery.v2",
    "dev.agentpod.permission.v2",
  ]) {
    const c = firstValid(
      type,
      (v) => typeof subjectOf(v)?.expires_at === "string",
    );
    for (const [expires_at, why] of looseExpiries)
      bad(type, why, { ...c, subject: { ...subjectOf(c), expires_at } });
  }

  for (const type of [
    "dev.superpipeline.gate.v2",
    "dev.superpipeline.attention.v2",
    "dev.agentpod.permission.v2",
    "dev.superpipeline.question.v2",
  ]) {
    const c = firstValid(
      type,
      (v) =>
        Array.isArray(v.options) && v.options.length > 0 && !("free_text" in v),
    );
    bad(type, "no options: nothing to answer with", { ...c, options: [] });
  }

  const permission = firstValid(
    "dev.agentpod.permission.v2",
    (v) => Array.isArray(v.options) && v.options.length > 0,
  );
  const option = (permission.options as unknown[])[0] as Record<
    string,
    unknown
  >;
  bad(
    "dev.agentpod.permission.v2",
    "twenty-one options: more than any decision card carries",
    {
      ...permission,
      options: Array.from({ length: 21 }, (_, n) => ({
        ...option,
        id: `o${n}`,
      })),
    },
  );
}
