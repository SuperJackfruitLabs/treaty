/**
 * permission.v2: a harness permission prompt in AgentPod's own decision envelope.
 *
 * charter → "Strict decisions and harness permissions bind their subject" §5–6. The event namespace
 * follows the judge: superpipeline judges questions and gates, AgentPod judges a harness's ACP
 * `session/request_permission`. The station room's prose message keeps the v1 card it has always
 * carried (`dev.agentpod.permission`) and also carries `suite_event_type: dev.agentpod.permission.v2`:
 * options that say what they mean and how far they reach, and a `harness-permission/v1` subject whose
 * preview shows what the agent would do. The subject is bounded by gate.v2's own helper
 * (`subjectV2`), so the bounds and the rule (no approval of an incomplete preview) are the same.
 *
 * Moved from the hub's `matrix-as/permission-wire.ts`. How a request's subject and digest are
 * derived from ACP stays in AgentPod, which judges the answer.
 */

import { z } from "./check.ts";
import type { GateOptionMeaning, GateSubjectV2 } from "./gate.ts";
import type { OptionScope } from "./question.ts";
import { bindingOf, referenceOf } from "./answers.ts";

export const PERMISSION_V2_SUITE_TYPE = "dev.agentpod.permission.v2";
export const PERMISSION_ANSWER_V2_SUITE_TYPE =
  "dev.agentpod.permission.answer.v2";
/**
 * The receipt that closes a permission card. AgentPod's own, because gate.outcome.v1 is keyed by a
 * board and a gate, and a harness permission has neither.
 */
export const PERMISSION_OUTCOME_TYPE = "dev.agentpod.permission.outcome.v1";

/** The subject schema a harness permission is bound to. */
export const HARNESS_PERMISSION_SCHEMA = "harness-permission/v1";

export type PermissionMeaning = "approve" | "reject" | "choose";
export type PermissionScope = "once" | "always";

/** ACP's option kinds, and what each means (charter §5). Anything else is a neutral choice. */
const KIND_MEANINGS: Record<
  string,
  { meaning: PermissionMeaning; scope: PermissionScope }
> = {
  allow_once: { meaning: "approve", scope: "once" },
  allow_always: { meaning: "approve", scope: "always" },
  reject_once: { meaning: "reject", scope: "once" },
  reject_always: { meaning: "reject", scope: "always" },
};

/** What an ACP option kind means, and how far it reaches; a neutral choice for any other kind. */
export function permissionKindMeaning(kind: unknown): {
  meaning: PermissionMeaning;
  scope?: PermissionScope;
} {
  return (
    (typeof kind === "string" ? KIND_MEANINGS[kind] : undefined) ?? {
      meaning: "choose",
    }
  );
}

/** One option of a permission.v2, as it rides on the Matrix wire. */
export interface PermissionOptionV2 {
  id: string;
  label: string;
  meaning: GateOptionMeaning;
  scope?: OptionScope;
}

const AcpOption = z.object({
  optionId: z.string().min(1).max(200),
  name: z.string(),
  kind: z.string().optional(),
});

/** As many options as a gate.v2 carries; the prose message still lists every one. */
const OPTIONS_MAX = 20;

/**
 * The options a harness offered, in its order, with meanings; one with no usable id is dropped,
 * and none past the twentieth is carried.
 */
export function permissionOptionsV2(rawOptions: unknown): PermissionOptionV2[] {
  if (!Array.isArray(rawOptions)) return [];
  const seen = new Set<string>();
  const out: PermissionOptionV2[] = [];
  for (const raw of rawOptions) {
    const parsed = AcpOption.safeParse(raw);
    if (!parsed.success || seen.has(parsed.data.optionId)) continue;
    const o = parsed.data;
    seen.add(o.optionId);
    const mapped = permissionKindMeaning(o.kind);
    out.push({
      id: o.optionId,
      label: o.name.length > 200 ? `${o.name.slice(0, 199)}…` : o.name,
      meaning: mapped.meaning,
      ...(mapped.scope ? { scope: mapped.scope } : {}),
    });
    if (out.length === OPTIONS_MAX) break;
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Everything permission.v2 needs from a request, and the binding recorded for it. */
export interface HarnessPermission {
  requestId: string;
  sessionId: string;
  requestSeq: number;
  title: string;
  toolKind: string | null;
  options: PermissionOptionV2[];
  subject: GateSubjectV2;
  expiresAt: Date;
}

/**
 * The permission.v2 fields on the station room's prose message: the marker and the envelope, beside
 * the v1 card the message already carries under `dev.agentpod.permission`.
 */
export function permissionV2Content(
  p: HarnessPermission,
): Record<string, unknown> {
  return {
    suite_event_type: PERMISSION_V2_SUITE_TYPE,
    schema_version: 1,
    request_id: p.requestId,
    session_id: p.sessionId,
    request_seq: p.requestSeq,
    title: p.title,
    ...(p.toolKind ? { tool_kind: p.toolKind } : {}),
    options: p.options,
    subject: p.subject,
  };
}

// ── The answer ───────────────────────────────────────────────────────────────

const ID_MAX = 600;

export interface ParsedPermissionAnswer {
  requestId: string;
  optionId: string;
  subject: { id: string; digest: string } | null;
  referencedEventId: string | null;
}

/** Does this message say it is a permission.answer.v2? */
export function isPermissionAnswerMarked(
  content: unknown,
): content is Record<string, unknown> {
  return (
    isRecord(content) &&
    content.suite_event_type === PERMISSION_ANSWER_V2_SUITE_TYPE
  );
}

/**
 * Read a permission.answer.v2 out of an `m.room.message`, or null when it is not one. Any message
 * marked as one is never a prompt, whether or not it parses: a caller checks the marker first.
 */
export function parsePermissionAnswer(
  content: unknown,
): ParsedPermissionAnswer | null {
  if (!isPermissionAnswerMarked(content)) return null;
  const requestId = content.request_id;
  const optionId = content.option_id;
  if (
    typeof requestId !== "string" ||
    requestId === "" ||
    requestId.length > ID_MAX
  )
    return null;
  if (
    typeof optionId !== "string" ||
    optionId === "" ||
    optionId.length > ID_MAX
  )
    return null;
  return {
    requestId,
    optionId,
    subject: bindingOf(content),
    referencedEventId: referenceOf(content),
  };
}

// ── The outcome ──────────────────────────────────────────────────────────────

export type PermissionOutcome = "selected" | "expired" | "cancelled";

/**
 * The structured receipt that closes a permission card, pointing at the prose message the card was
 * drawn from. `decided_by` is the person's label, never an mxid; null when nobody in the room did.
 */
export function permissionOutcomeContent(
  p: {
    requestId: string;
    sessionId: string;
    requestSeq: number;
    eventId: string;
  },
  outcome: PermissionOutcome,
  optionId: string | null,
  decidedBy: string | null,
): Record<string, unknown> {
  return {
    suite_event_type: PERMISSION_OUTCOME_TYPE,
    request_id: p.requestId,
    session_id: p.sessionId,
    request_seq: p.requestSeq,
    outcome,
    option_id: optionId,
    decided_by: decidedBy,
    "m.relates_to": { rel_type: "m.reference", event_id: p.eventId },
  };
}

/** The prose line beside the receipt. */
export function permissionOutcomeText(
  outcome: PermissionOutcome,
  optionLabel: string | null,
  decidedBy: string | null,
): string {
  if (outcome === "expired")
    return "That permission request expired unanswered, so the agent was told it was not given.";
  if (outcome === "cancelled") return "That permission request was withdrawn.";
  const what = optionLabel ?? "Answered";
  return decidedBy
    ? `${what} — answered by ${decidedBy}.`
    : `${what} — answered.`;
}
