/**
 * The way back: reading a person's answer out of an `m.room.message`, and the receipt that says the
 * board accepted it.
 *
 * Moved from the hub's `gate-decision.ts`, `question-answer.ts`, `delivery-answer.ts` and
 * `attention-answer.ts`: only the parsing and the content of the receipts. Judging an answer against
 * what was posted, and acting on it, stay with the service that posted it.
 *
 * Every answer is an ordinary message carrying `suite_event_type` in content, not a custom type: a
 * decision needs no renderer, so sending it as a message means it reads in every client. Where an
 * answer must reference the message that asked, `m.relates_to` must be an **`m.reference`**:
 * `m.in_reply_to` is a rendering hint every client sets when quoting, so accepting it would let an
 * ordinary quoted reply decide.
 */

import { ATTENTION_ANSWER_V2_SUITE_TYPE } from "./attention.ts";
import { DELIVERY_ANSWER_V2_SUITE_TYPE } from "./delivery.ts";
import {
  GATE_DECISION_SUITE_TYPE,
  GATE_DECISION_V2_SUITE_TYPE,
  GATE_OUTCOME_TYPE,
  isGateOptionId,
} from "./gate.ts";
import { heldTail, heldUntilOf } from "./release.ts";
import { QUESTION_ANSWER_V2_SUITE_TYPE } from "./question.ts";

/** The event an `m.reference` relation points at, or null. */
export function referenceOf(content: object): string | null {
  if (!("m.relates_to" in content)) return null;
  const rel = content["m.relates_to"];
  if (typeof rel !== "object" || rel === null) return null;
  if (!("rel_type" in rel) || rel.rel_type !== "m.reference") return null;
  if (!("event_id" in rel) || typeof rel.event_id !== "string") return null;
  return rel.event_id;
}

/** The longest subject id or digest read off an answer: the gate's bound. */
const SUBJECT_KEY_MAX = 512;

/**
 * An answer's `subject {id, digest}`, or null when it carries none or one that is not two non-empty
 * strings within the gate's bound. Read off question and permission answers.
 */
export function bindingOf(
  content: object,
): { id: string; digest: string } | null {
  if (!("subject" in content)) return null;
  const s = content.subject;
  if (typeof s !== "object" || s === null || !("id" in s) || !("digest" in s))
    return null;
  const { id, digest } = s;
  if (typeof id !== "string" || typeof digest !== "string") return null;
  if (
    id === "" ||
    digest === "" ||
    id.length > SUBJECT_KEY_MAX ||
    digest.length > SUBJECT_KEY_MAX
  ) {
    return null;
  }
  return { id, digest };
}

// ── gate.decision.v1 and gate.decision.v2 ────────────────────────────────────

/** The subject an answer says it was shown: copied from the gate.v2 the person saw. */
export interface GateSubjectBinding {
  id: string;
  digest: string;
}

export interface ParsedGateDecision {
  /** Which answer type it arrived as: `decision.v1` or `decision.v2`. */
  version: 1 | 2;
  gateId: string;
  /**
   * For v1, one of the three v1 ids. For v2, whatever the client sent: no list is kept, and the
   * carrier checks it against the options it recorded for that gate.
   */
  optionId: string;
  comment: string | null;
  referencedEventId: string | null;
  /** v2 only, and null when absent or malformed. */
  subject: GateSubjectBinding | null;
}

/** The subject binding a decision.v2 carries, or null when there is none to read. */
function subjectBinding(v: unknown): GateSubjectBinding | null {
  if (typeof v !== "object" || v === null) return null;
  if (!("id" in v) || !("digest" in v)) return null;
  const { id, digest } = v;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof digest !== "string" ||
    digest.length === 0
  ) {
    return null;
  }
  return { id, digest };
}

/** Read a gate decision (v1 or v2) out of an `m.room.message`, or null when it is not one. */
export function parseGateDecision(content: unknown): ParsedGateDecision | null {
  if (typeof content !== "object" || content === null) return null;
  const c = content as Record<string, unknown>;
  const version =
    c.suite_event_type === GATE_DECISION_SUITE_TYPE
      ? 1
      : c.suite_event_type === GATE_DECISION_V2_SUITE_TYPE
        ? 2
        : null;
  if (version === null) return null;
  if (typeof c.gate_id !== "string" || c.gate_id.length === 0) return null;
  // v1 keeps its three ids. v2 keeps no list (charter gate.v2 §2): any non-empty id is read, and
  // checked against what the gate offered once the gate is known.
  const optionId = c.option_id;
  if (typeof optionId !== "string" || optionId.length === 0) return null;
  if (version === 1 && !isGateOptionId(optionId)) return null;

  const rel = c["m.relates_to"];
  let referencedEventId: string | null = null;
  if (typeof rel === "object" && rel !== null) {
    const r = rel as Record<string, unknown>;
    if (r.rel_type === "m.reference" && typeof r.event_id === "string") {
      referencedEventId = r.event_id;
    }
  }

  return {
    version,
    gateId: c.gate_id,
    optionId,
    comment:
      typeof c.comment === "string" && c.comment.trim() !== ""
        ? c.comment
        : null,
    referencedEventId,
    subject: version === 2 ? subjectBinding(c.subject) : null,
  };
}

// ── gate.outcome.v1 ──────────────────────────────────────────────────────────

/** How each decision reads in a sentence. Falls back to the option id. */
const OUTCOME_VERBS: Record<string, string> = {
  approve: "Approved",
  // An approval gate bound to a publishing subject offers these two instead of `approve`.
  approve_automatic: "Approved for automatic delivery",
  approve_manual: "Approved for manual delivery",
  reject: "Rejected",
  request_changes: "Changes requested",
  expired: "Expired",
};

/**
 * Outcomes nobody chose, said as a whole sentence. A subject-bound gate whose subject passed its
 * `expires_at` is closed by the board as `expired`, and "Expired — the board has it" would read as
 * though someone had answered.
 */
const OUTCOME_SENTENCES: Record<string, string> = {
  expired:
    "Expired — what this gate approves passed its expiry before anyone approved it, so it can no longer be approved here.",
};

/** How a decision reads in a sentence; an approval that chose a variant names it. */
function outcomeVerb(
  decision: string,
  chosen: { label: string } | null,
): string {
  const verb = OUTCOME_VERBS[decision] ?? decision;
  if (!chosen || !verb.startsWith("Approved")) return verb;
  return `Approved "${chosen.label}"${verb.slice("Approved".length)}`;
}

/** What a gate's receipt is built from. */
export interface GateOutcome {
  gateId: string;
  boardId: string;
  decision: string;
  /** The person's label, never an mxid; null when nobody in the room decided it. */
  decidedBy: string | null;
  /** The variant an approval chose, on a variant gate, when it is known. */
  chosen?: { id: string; label: string } | null;
  /** A held approval's release time: the receipt says it goes ahead then, unless pulled back. */
  heldUntil?: string | null;
  /** The gate's own event, which a card is drawn from. */
  gateEventId: string;
}

/** The prose line of a gate's receipt. */
export function gateOutcomeBody(
  o: Pick<GateOutcome, "decision" | "decidedBy" | "chosen" | "heldUntil">,
): string {
  const verb = outcomeVerb(o.decision, o.chosen ?? null);
  const heldUntil = heldUntilOf(o.heldUntil);
  const tail = heldUntil ? heldTail(heldUntil) : "the board has it.";
  return (
    OUTCOME_SENTENCES[o.decision] ??
    (o.decidedBy ? `${verb} by ${o.decidedBy} — ${tail}` : `${verb} — ${tail}`)
  );
}

/**
 * The structured half of a gate's receipt. It points at the gate's own event rather than the prose:
 * a client that finds it knows which card to close.
 */
export function gateOutcomeContent(o: GateOutcome): Record<string, unknown> {
  const heldUntil = heldUntilOf(o.heldUntil);
  return {
    suite_event_type: GATE_OUTCOME_TYPE,
    gate_id: o.gateId,
    board_id: o.boardId,
    decision: o.decision,
    decided_by: o.decidedBy,
    ...(o.chosen
      ? { chosen_variant: { id: o.chosen.id, label: o.chosen.label } }
      : {}),
    ...(heldUntil ? { held_until: heldUntil } : {}),
    "m.relates_to": { rel_type: "m.reference", event_id: o.gateEventId },
  };
}

// ── question.answer.v2 ───────────────────────────────────────────────────────

/** The longest id read off an answer; anything longer names nothing a carrier posted. */
const ID_MAX = 200;

export interface ParsedQuestionAnswer {
  elicitationId: string;
  /** Null for a free-text answer. */
  optionId: string | null;
  /** Trimmed; null when absent or blank. */
  text: string | null;
  referencedEventId: string | null;
  /** The binding copied from the question the person saw; absent when the answer carries none. */
  subject?: { id: string; digest: string };
}

/** Read a question.answer.v2 out of an `m.room.message`, or null when it is not one. */
export function parseQuestionAnswer(
  content: unknown,
): ParsedQuestionAnswer | null {
  if (typeof content !== "object" || content === null) return null;
  if (
    !("suite_event_type" in content) ||
    content.suite_event_type !== QUESTION_ANSWER_V2_SUITE_TYPE
  )
    return null;
  if (!("elicitation_id" in content)) return null;
  const elicitationId = content.elicitation_id;
  if (
    typeof elicitationId !== "string" ||
    elicitationId.length === 0 ||
    elicitationId.length > ID_MAX
  )
    return null;
  const optionId =
    "option_id" in content &&
    typeof content.option_id === "string" &&
    content.option_id !== ""
      ? content.option_id
      : null;
  const text =
    "text" in content &&
    typeof content.text === "string" &&
    content.text.trim() !== ""
      ? content.text.trim()
      : null;
  const subject = bindingOf(content);
  return {
    elicitationId,
    optionId,
    text,
    referencedEventId: referenceOf(content),
    ...(subject ? { subject } : {}),
  };
}

/** A subject's binding as the carrier recorded it when it posted the question. */
export interface RecordedSubject {
  id: string;
  digest: string;
  /** False (or unknown) refuses an approving answer: the card could not show it all. */
  previewComplete: boolean;
  /** Null when the subject named no expiry the carrier could read; the board still judges it. */
  expiresAt: Date | null;
}

export type SubjectRefusal =
  | "subject-missing"
  | "subject-mismatch"
  | "expired"
  | "preview-incomplete";

/**
 * Why an answer to a subject-bound decision must not be carried, or null. The order: a binding
 * first, then its match, then expiry, then the preview rule for approvals.
 */
export function subjectRefusal(
  recorded: RecordedSubject,
  binding: { id: string; digest: string } | null,
  meaning: string | undefined,
  now: Date,
): SubjectRefusal | null {
  if (!binding) return "subject-missing";
  if (binding.id !== recorded.id || binding.digest !== recorded.digest)
    return "subject-mismatch";
  if (
    recorded.expiresAt !== null &&
    now.getTime() >= recorded.expiresAt.getTime()
  )
    return "expired";
  if (meaning === "approve" && !recorded.previewComplete)
    return "preview-incomplete";
  return null;
}

/** What the room is told for each. */
export const SUBJECT_REFUSAL_TEXT: Record<SubjectRefusal, string> = {
  "subject-missing":
    "That answer did not say which version it answers. Nothing has changed.",
  "subject-mismatch":
    "That answer was for a different version of this decision. Open the latest one and answer again. Nothing has changed.",
  expired:
    "This decision has expired, so it can no longer be answered. Nothing has changed.",
  "preview-incomplete":
    "The card could not show everything being approved, so it cannot be approved from here. Open it on the board. Nothing has changed.",
};

// ── delivery.answer.v2 ───────────────────────────────────────────────────────

export interface ParsedDeliveryAnswer {
  gateId: string;
  optionId: string;
  /** Trimmed; null when absent or blank. For `record_live_url`, the live link. */
  text: string | null;
  referencedEventId: string | null;
}

/** Read a delivery.answer.v2 out of an `m.room.message`, or null when it is not one. */
export function parseDeliveryAnswer(
  content: unknown,
): ParsedDeliveryAnswer | null {
  if (typeof content !== "object" || content === null) return null;
  if (
    !("suite_event_type" in content) ||
    content.suite_event_type !== DELIVERY_ANSWER_V2_SUITE_TYPE
  )
    return null;
  if (!("gate_id" in content) || !("option_id" in content)) return null;
  const { gate_id: gateId, option_id: optionId } = content;
  if (
    typeof gateId !== "string" ||
    gateId.length === 0 ||
    gateId.length > ID_MAX
  )
    return null;
  if (typeof optionId !== "string" || optionId.length === 0) return null;
  const text =
    "text" in content &&
    typeof content.text === "string" &&
    content.text.trim() !== ""
      ? content.text.trim()
      : null;
  return { gateId, optionId, text, referencedEventId: referenceOf(content) };
}

// ── attention.answer.v2 ──────────────────────────────────────────────────────

/** Which wait an answer names: its board, card and wait id. */
export interface WaitKey {
  boardId: string;
  cardId: string;
  waitId: string;
}

export interface ParsedAttentionAnswer extends WaitKey {
  optionId: string;
  /** Trimmed; null when absent or blank. For a resume, the instruction for the next attempt. */
  text: string | null;
  referencedEventId: string | null;
}

const idOk = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= ID_MAX;

/** Read an attention.answer.v2 out of an `m.room.message`, or null when it is not one. */
export function parseAttentionAnswer(
  content: unknown,
): ParsedAttentionAnswer | null {
  if (typeof content !== "object" || content === null) return null;
  if (
    !("suite_event_type" in content) ||
    content.suite_event_type !== ATTENTION_ANSWER_V2_SUITE_TYPE
  )
    return null;
  const c = content as Record<string, unknown>;
  if (
    !idOk(c.board_id) ||
    !idOk(c.card_id) ||
    !idOk(c.wait_id) ||
    !idOk(c.option_id)
  )
    return null;
  const text =
    typeof c.text === "string" && c.text.trim() !== "" ? c.text.trim() : null;
  return {
    boardId: c.board_id,
    cardId: c.card_id,
    waitId: c.wait_id,
    optionId: c.option_id,
    text,
    referencedEventId: referenceOf(content),
  };
}
