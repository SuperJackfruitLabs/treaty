/** The cases taken from the source corpus, fixtures/ecosystem-identity/matrix_gate_events.json. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Invalid, Examples } from "./types.ts";

const root = join(import.meta.dir, "../..");

/** The source corpus's reject cases that a schema cannot refuse, and why. */
const UNIQUE: ReadonlySet<string> = new Set([
  "duplicate option ids. Resolution is by id, so two `approve` entries are ambiguous regardless of their labels.",
  "duplicate option ids. Answering is by id.",
  "two variants sharing an id. A choice is made by variant; two with one id are an ambiguous answer.",
  "the same person counted twice",
  "two checks of one name",
]);
const RECORDED: ReadonlySet<string> = new Set([
  "an answer to a subject-bound gate with no subject binding",
  "an option that needs a comment, without one",
  "an option the gate did not offer",
  "an option the question did not offer",
  "the option whose input is required, with no text",
  "a free-text answer over the question's limit",
  "switching to automatic delivery on a follow-up whose preview was incomplete",
  "an approval with no binding",
  "a binding whose digest is not the question's",
  "a decline whose binding names another subject",
  "a binding whose digest is not the request's",
  "an option the request did not offer",
  "a different wait than the one posted",
  "a reference to another message",
  "allow once with no binding",
  "allow once bound to another digest",
  "allow always, which is never offered",
  "a v1 card for a variant gate offering approve. Its answer could carry no choice.",
  "an approval with no binding: it chooses nothing",
  "a binding that names no variant of the gate",
  "choosing the variant whose preview was incomplete. It can be chosen on the board.",
]);

function refusedBy(why: string): Invalid["refusedBy"] {
  if (UNIQUE.has(why)) return "unique";
  if (RECORDED.has(why)) return "recorded";
  return "schema";
}

export function fromSourceCorpus(out: Examples): void {
  const source = JSON.parse(
    readFileSync(
      join(root, "fixtures/ecosystem-identity/matrix_gate_events.json"),
      "utf8",
    ),
  ) as {
    events: Array<{
      suiteEventType: string;
      variant?: string;
      accept: Array<{ why: string; content: unknown }>;
      reject: Array<{ why: string; content: unknown }>;
    }>;
  };
  for (const e of source.events) {
    const entry = (out[e.suiteEventType] ??= { valid: {}, invalid: [] });
    const prefix = e.variant ? `${e.variant}: ` : "";
    for (const a of e.accept) entry.valid[`${prefix}${a.why}`] = a.content;
    for (const r of e.reject)
      entry.invalid.push({
        why: `${prefix}${r.why}`,
        refusedBy: refusedBy(r.why),
        body: r.content,
      });
  }
}
