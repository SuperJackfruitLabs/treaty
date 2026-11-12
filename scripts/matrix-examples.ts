/**
 * Builds `fixtures/matrix-events/examples.json`, the corpus every schema in `schemas/matrix/` is
 * checked against: `bun scripts/matrix-examples.ts` writes it, and `scripts/matrix-schemas.test.ts`
 * fails when the file is not what this builds.
 *
 * Two sources, so the corpus records what the products already agree on rather than what this
 * package thinks:
 *
 * - every `accept` and `reject` case of `fixtures/ecosystem-identity/matrix_gate_events.json`, the
 *   corpus the AgentPod hub and SuperMessage's core have pinned since 2026-08; and
 * - content built by this package's own builders from the bodies SuperPipeline sends, so a builder
 *   that drifts from its schema, or changes what it emits, changes this file.
 *
 * Each invalid case says what refuses it (`refusedBy`): `schema` (the JSON Schema), `unique` (an
 * `x-uniqueBy` rule of that schema), or `recorded` (only the carrier can, against what it recorded
 * when it posted: an option the gate did not offer, a binding that names another subject).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  attentionV2Content,
  checkFailedContent,
  checkOverriddenContent,
  checksWaitingContent,
  decisionNoticeContent,
  deliveryV2Content,
  elicitationRequestCard,
  gateEventContent,
  gateOutcomeContent,
  gateProgressContent,
  gateRequestCard,
  gateV2Content,
  permissionOutcomeContent,
  permissionV2Content,
  pulledBackContent,
  questionV2Content,
  quorumV2,
  releasedContent,
  type AttentionPendingDelivery,
  type DeliveryPendingDelivery,
  type ElicitationPendingDelivery,
  type GatePendingDelivery,
  type GateSubjectV2,
} from "../packages/matrix-events/src/index.ts";

const root = join(import.meta.dir, "..");
export const EXAMPLES_PATH = join(root, "fixtures/matrix-events/examples.json");

type Invalid = {
  why: string;
  refusedBy: "schema" | "unique" | "recorded";
  body: unknown;
};
type Examples = Record<
  string,
  { valid: Record<string, unknown>; invalid: Invalid[] }
>;

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

function fromSourceCorpus(out: Examples): void {
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

// ── Built by this package, from bodies SuperPipeline sends ───────────────────

const LINK = "https://superpipeline.dev/b/brd_7c1f/c/crd_6b40";
const TS = "2030-01-01T09:00:00.000Z";

const gate = (
  over: Partial<GatePendingDelivery> = {},
): GatePendingDelivery => ({
  event: "gate.pending",
  boardId: "brd_7c1f",
  cardId: "crd_6b40",
  gateId: "gate_8f3a",
  stageKey: "review",
  returnStageKey: "draft",
  cardTitle: "Ship the release notes",
  producedBy: "agt_31d0",
  handoffSummary: "Release notes for 0.4, three sections.",
  options: [
    { id: "approve", label: "Approve" },
    { id: "request_changes", label: "Request changes" },
    { id: "reject", label: "Reject" },
  ],
  ts: TS,
  ...over,
});

const post = {
  id: "sub_post_1",
  digest: "sha256:9a1e",
  schema: "x-post/v1",
  revision: 1,
  expiresAt: "2030-01-02T03:04:05Z",
  preview: [
    { type: "text", label: "Post", text: "Our next release ships today." },
    { type: "field", label: "Account", value: "@fixture_account on X" },
  ],
  previewComplete: true,
};

const publishing = [
  {
    id: "approve_manual",
    label: "Approve — I'll post it myself",
    meaning: "approve",
    needsComment: false,
    delivery: "manual",
  },
  {
    id: "approve_automatic",
    label: "Approve — post automatically",
    meaning: "approve",
    needsComment: false,
    delivery: "automatic",
  },
  {
    id: "request_changes",
    label: "Request changes",
    meaning: "revise",
    needsComment: true,
  },
  { id: "reject", label: "Reject", meaning: "reject", needsComment: false },
];

const question = (
  over: Partial<ElicitationPendingDelivery> = {},
): ElicitationPendingDelivery => ({
  event: "elicitation.pending",
  boardId: "brd_7c1f",
  cardId: "crd_51d0",
  cardTitle: "Upgrade the build image",
  elicitationId: "elc_7f3c",
  runId: "run_12",
  stageKey: "build",
  agentId: "agt_31d0",
  question: "The tests need network access. May I run them?",
  options: [
    { id: "run_them", label: "Run the tests" },
    { id: "skip", label: "Skip them" },
  ],
  ts: TS,
  ...over,
});

const delivery = (
  over: Partial<DeliveryPendingDelivery> = {},
): DeliveryPendingDelivery => ({
  event: "delivery.pending",
  boardId: "brd_7c1f",
  cardId: "crd_6b40",
  cardTitle: "Announce the release",
  gateId: "gate_8f3a",
  stageKey: "approve",
  approvalSubject: post,
  options: [
    {
      id: "record_live_url",
      label: "Record the live link",
      input: { kind: "url", label: "Live link" },
    },
    { id: "switch_to_automatic", label: "Post it automatically instead" },
  ],
  ts: TS,
  ...over,
});

const attention = (
  over: Partial<AttentionPendingDelivery> = {},
): AttentionPendingDelivery => ({
  event: "attention.pending",
  boardId: "brd_7c1f",
  cardId: "crd_6b40",
  cardTitle: "Ship the release",
  stageKey: "build",
  stageName: "Build",
  waitId: "wait_0123456789abcdef",
  reason: "repeated-failure",
  failureCount: 3,
  summary: "The build keeps timing out",
  detail: "npm ci timed out after 600s",
  options: [
    { id: "resume_here", label: "Resume here" },
    { id: "resume_at:plan", label: "Resume at Plan" },
    { id: "archive", label: "Archive" },
    { id: "move_to:done", label: "Move to Done" },
  ],
  ts: TS,
  ...over,
});

const permissionSubject: GateSubjectV2 = {
  id: "acps_1:4",
  digest: "c0ffee",
  schema: "harness-permission/v1",
  revision: 1,
  expires_at: "2030-01-01T09:30:00.000Z",
  preview: [{ type: "text", label: "Command", text: "bun test" }],
  preview_complete: true,
};

function built(out: Examples): void {
  const add = (type: string, label: string, content: unknown) => {
    (out[type] ??= { valid: {}, invalid: [] }).valid[`built: ${label}`] =
      content;
  };

  const plain = gate();
  const v1 = gateEventContent(plain, LINK);
  add("dev.superpipeline.gate.v1", "a gate bound to no subject", v1);
  add(
    "dev.superpipeline.gate",
    "the same gate as the embedded card",
    gateRequestCard(plain, LINK),
  );
  add(
    "dev.superpipeline.gate.v2",
    "a gate bound to no subject",
    gateV2Content(plain, LINK),
  );
  add(
    "dev.superpipeline.gate.v2",
    "a publishing gate bound to a subject",
    gateV2Content(gate({ options: publishing, approvalSubject: post }), LINK),
  );
  add(
    "dev.superpipeline.gate.v2",
    "a subject whose preview the board cut: no approving option",
    gateV2Content(
      gate({
        options: publishing,
        approvalSubject: { ...post, previewComplete: false },
      }),
    ),
  );
  add(
    "dev.superpipeline.gate.v2",
    "a choice of two variants",
    gateV2Content(
      gate({
        options: publishing,
        approvalSubject: {
          variants: [
            {
              id: "short",
              label: "Short",
              subject: { ...post, id: "sub_short" },
            },
            {
              id: "long",
              label: "Long form",
              subject: { ...post, id: "sub_long", digest: "sha256:77aa" },
            },
          ],
        },
      }),
      LINK,
    ),
  );
  const quorum = {
    required: 2,
    from: "deciders",
    approvals: [{ principalId: "prn_00e5464a206549ff8c78", at: TS }],
  };
  add(
    "dev.superpipeline.gate.v2",
    "a quorum, a hold, checks and a deadline together",
    gateV2Content(
      gate({
        quorum,
        release: { holdForMinutes: 30, notBefore: "2030-01-02T09:00:00Z" },
        checks: [
          {
            name: "build",
            provider: "ci",
            status: "passed",
            url: "https://ci.example/run/1",
          },
          { name: "claims", provider: "verdict", status: "overridden" },
        ],
        deadline: {
          remindAt: "2030-01-01T12:00:00Z",
          escalateAt: "2030-01-02T09:00:00Z",
        },
      }),
      LINK,
    ),
  );

  add(
    "dev.superpipeline.elicitation",
    "a question with two options",
    elicitationRequestCard(question(), LINK),
  );
  add(
    "dev.superpipeline.question.v2",
    "a question with two options",
    questionV2Content(question(), LINK),
  );
  add(
    "dev.superpipeline.question.v2",
    "a question answered by typing",
    questionV2Content(
      question({ options: [], freeText: { maxLength: 500 } }),
      LINK,
    ),
  );
  add(
    "dev.superpipeline.question.v2",
    "a SuperToolkit approval request",
    questionV2Content(
      question({
        cardId: "",
        runId: "",
        stageKey: "",
        cardTitle: "Approval request",
        elicitationId: "apr_5d2e9c41",
        approvalRequestId: "apr_5d2e9c41",
        question: "Allow github issues.create on acme/site?",
        options: [
          {
            id: "allow_once",
            label: "Allow once",
            meaning: "approve",
            scope: "once",
            requires: "workspace-admin",
          },
          { id: "deny", label: "Deny", meaning: "reject", scope: "once" },
        ],
        approvalSubject: {
          ...post,
          id: "stkreq_8f2c",
          schema: "stk-capability/v1",
        },
      }),
    ),
  );

  add(
    "dev.superpipeline.delivery.v2",
    "a follow-up with a complete preview",
    deliveryV2Content(delivery(), LINK),
  );
  add(
    "dev.superpipeline.delivery.v2",
    "a follow-up whose preview was cut: no switch to automatic",
    deliveryV2Content(
      delivery({ approvalSubject: { ...post, previewComplete: false } }),
      LINK,
    ),
  );
  add(
    "dev.superpipeline.attention.v2",
    "a card that keeps failing; a forward move is not offered",
    attentionV2Content(attention(), LINK),
  );

  add(
    "dev.superpipeline.gate.outcome.v1",
    "an approval",
    gateOutcomeContent({
      gateId: "gate_8f3a",
      boardId: "brd_7c1f",
      decision: "approve",
      decidedBy: "rakesh",
      gateEventId: "$gateEvent",
    }),
  );
  add(
    "dev.superpipeline.gate.outcome.v1",
    "a held approval of a chosen variant",
    gateOutcomeContent({
      gateId: "gate_8f3a",
      boardId: "brd_7c1f",
      decision: "approve_automatic",
      decidedBy: "rakesh",
      chosen: { id: "short", label: "Short" },
      heldUntil: "2030-01-02T09:00:00Z",
      gateEventId: "$gateEvent",
    }),
  );
  const q = quorumV2(quorum);
  if (q && q.approvals[0])
    add(
      "dev.agentpod.gate.progress.v2",
      "one of two approvals",
      gateProgressContent({
        gateId: "gate_8f3a",
        boardId: "brd_7c1f",
        cardId: "crd_6b40",
        approval: q.approvals[0],
        quorum: q,
        approvedBy: "rakesh",
        variantLabel: null,
        gateEventId: "$gateEvent",
      }),
    );
  const notice = {
    boardId: "brd_7c1f",
    cardId: "crd_6b40",
    cardTitle: "Ship the release notes",
    stageKey: "review",
    decisionKind: "gate" as const,
    decisionId: "gate_8f3a",
    waitingSince: "2030-01-01T09:00:00.000Z",
    ts: TS,
  };
  add(
    "dev.superpipeline.decision.reminded.v1",
    "a gate reminded after three hours",
    decisionNoticeContent(
      {
        ...notice,
        event: "decision.reminded",
        remindedAt: "2030-01-01T12:00:00.000Z",
      },
      "$cardEvent",
    ),
  );
  add(
    "dev.superpipeline.decision.escalated.v1",
    "a gate escalated after a day",
    decisionNoticeContent(
      {
        ...notice,
        event: "decision.escalated",
        escalatedAt: "2030-01-02T09:00:00.000Z",
      },
      "$cardEvent",
      LINK,
    ),
  );
  const held = { boardId: "brd_7c1f", cardId: "crd_6b40", gateId: "gate_8f3a" };
  add(
    "dev.agentpod.decision.released.v2",
    "blocked at its release time",
    releasedContent(
      {
        ...held,
        event: "decision.released",
        decision: "approve",
        releaseAt: TS,
        releasedAt: TS,
        outcome: "blocked",
        reason: "the account is suspended.",
      },
      "$gateEvent",
    ),
  );
  add(
    "dev.agentpod.decision.pulled_back.v2",
    "pulled back with a comment",
    pulledBackContent(
      {
        ...held,
        event: "decision.pulled_back",
        pulledBackBy: "prn_00e5464a206549ff8c78",
        at: TS,
        comment: "  wrong image  ",
      },
      "rakesh",
      "$gateEvent",
    ),
  );
  const check = {
    boardId: "brd_7c1f",
    cardId: "crd_6b40",
    cardTitle: "Ship it",
    arrivalId: "arr_1",
    stageKey: "review",
  };
  add(
    "dev.agentpod.check.failed.v2",
    "a failed CI check that sent the card back",
    checkFailedContent(
      {
        ...check,
        event: "check.failed",
        check: {
          name: "build",
          provider: "ci",
          status: "failed",
          detail: "2 tests failed",
          url: "https://ci.example/run/2",
        },
        returnedTo: "draft",
      },
      "Ship it",
    ),
  );
  add(
    "dev.agentpod.check.overridden.v2",
    "an override with a comment",
    checkOverriddenContent(
      {
        ...check,
        event: "check.overridden",
        check: { name: "claims", provider: "verdict", status: "overridden" },
        by: "prn_00e5464a206549ff8c78",
        comment: "flaky runner",
        at: TS,
      },
      "rakesh",
      "Ship it",
      "$checksWaiting",
    ),
  );
  add(
    "dev.agentpod.checks.waiting.v2",
    "two checks overdue",
    checksWaitingContent(
      {
        boardId: "brd_7c1f",
        cardId: "crd_6b40",
        cardTitle: "Ship it",
        stageKey: "review",
        stageName: "Review",
        checks: [
          { name: "build", provider: "ci", status: "pending" },
          { name: "claims", provider: "verdict", status: "failed" },
        ],
      },
      LINK,
    ),
  );
  add("dev.agentpod.permission.v2", "a harness asks to run a command", {
    msgtype: "m.text",
    body: "The agent wants to run a command.",
    ...permissionV2Content({
      requestId: "acps_1:4",
      sessionId: "acps_1",
      requestSeq: 4,
      title: "Run bun test",
      toolKind: "execute",
      options: [
        { id: "allow", label: "Allow once", meaning: "approve", scope: "once" },
        { id: "reject", label: "Reject", meaning: "reject", scope: "once" },
      ],
      subject: permissionSubject,
      expiresAt: new Date("2030-01-01T09:30:00.000Z"),
    }),
  });
  add(
    "dev.agentpod.permission.outcome.v1",
    "an option selected",
    permissionOutcomeContent(
      {
        requestId: "acps_1:4",
        sessionId: "acps_1",
        requestSeq: 4,
        eventId: "$prose",
      },
      "selected",
      "allow",
      "rakesh",
    ),
  );

  // The v1 permission card and its legacy event carry one payload.
  const card = {
    schema_version: 1,
    session_id: "acps_1",
    request_seq: 4,
    title: "Run bun test",
    options: [
      { option_id: "allow", name: "Allow once" },
      { option_id: "reject", name: "Reject" },
    ],
  };
  add("dev.agentpod.permission", "a request with two options", card);
  add("dev.agentpod.permission.v1", "a request with two options", card);
}

/** Invalid cases the source corpus does not hold: the v1 cards, and the receipts it pins only valid cases of. */
function cardInvalid(out: Examples): void {
  const bad = (
    type: string,
    why: string,
    body: unknown,
    by: Invalid["refusedBy"] = "schema",
  ) =>
    (out[type] ??= { valid: {}, invalid: [] }).invalid.push({
      why,
      refusedBy: by,
      body,
    });
  const card = gateRequestCard(gate(), LINK);
  bad("dev.superpipeline.gate", "an option id outside GateDecision", {
    ...card,
    options: [{ id: "ship_it", label: "Ship it" }],
  });
  bad("dev.superpipeline.gate", "no options: nothing to answer with", {
    ...card,
    options: [],
  });
  bad(
    "dev.superpipeline.gate",
    "an empty gate_id: nothing to address an answer to",
    { ...card, gate_id: "" },
  );
  bad(
    "dev.superpipeline.gate",
    "two approve options",
    {
      ...card,
      options: [
        { id: "approve", label: "Yes" },
        { id: "approve", label: "Ship it" },
      ],
    },
    "unique",
  );
  const q = elicitationRequestCard(question(), LINK);
  bad(
    "dev.superpipeline.elicitation",
    "five options: a client draws four buttons",
    {
      ...q,
      options: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id })),
    },
  );
  bad(
    "dev.superpipeline.elicitation",
    "no elicitation_id: the question cannot be answered",
    { ...q, elicitation_id: "" },
  );
  bad(
    "dev.superpipeline.elicitation",
    "two options sharing an id",
    {
      ...q,
      options: [
        { id: "a", label: "A" },
        { id: "a", label: "Also A" },
      ],
    },
    "unique",
  );
  // The receipts and notices the source corpus pins only valid cases of.
  const ref = {
    "m.relates_to": { rel_type: "m.reference", event_id: "$gateEvent" },
  };
  const failed = {
    suite_event_type: "dev.agentpod.check.failed.v2",
    schema_version: 1,
    board_id: "brd_7c1f",
    card_id: "crd_6b40",
    stage_key: "review",
    returned_to: "draft",
    check: { name: "build", provider: "ci", status: "failed" },
  };
  bad(
    "dev.agentpod.check.failed.v2",
    "a check that passed: this notice is for a failure",
    { ...failed, check: { ...failed.check, status: "passed" } },
  );
  bad(
    "dev.agentpod.check.failed.v2",
    "no returned_to: a reader cannot tell sent back from waiting",
    (({ returned_to: _r, ...rest }) => rest)(failed),
  );
  bad(
    "dev.agentpod.check.failed.v2",
    "a check name with a slash, which the board never accepts",
    { ...failed, check: { ...failed.check, name: "ci/build" } },
  );
  const overridden = {
    suite_event_type: "dev.agentpod.check.overridden.v2",
    schema_version: 1,
    board_id: "brd_7c1f",
    card_id: "crd_6b40",
    stage_key: "review",
    check: { name: "claims", provider: "verdict", status: "overridden" },
    overridden_by: "rakesh",
    comment: "flaky runner",
    at: TS,
  };
  bad(
    "dev.agentpod.check.overridden.v2",
    "a blank comment: an override needs a reason",
    { ...overridden, comment: "   " },
  );
  bad(
    "dev.agentpod.check.overridden.v2",
    "a check still failed: this notice is for an override",
    { ...overridden, check: { ...overridden.check, status: "failed" } },
  );
  const waiting = {
    msgtype: "m.text",
    body: "Checks overdue",
    suite_event_type: "dev.agentpod.checks.waiting.v2",
    schema_version: 1,
    board_id: "brd_7c1f",
    card_id: "crd_6b40",
    card_title: "Ship it",
    stage_key: "review",
    checks: [{ name: "build", provider: "ci", status: "pending" }],
  };
  bad(
    "dev.agentpod.checks.waiting.v2",
    "no checks: there is nothing to override",
    { ...waiting, checks: [] },
  );
  bad(
    "dev.agentpod.checks.waiting.v2",
    "six checks: a stage has at most five",
    {
      ...waiting,
      checks: [1, 2, 3, 4, 5, 6].map((n) => ({
        name: `c${n}`,
        provider: "ci",
        status: "pending",
      })),
    },
  );
  bad(
    "dev.agentpod.checks.waiting.v2",
    "one check twice",
    { ...waiting, checks: [waiting.checks[0], waiting.checks[0]] },
    "unique",
  );
  const progress = {
    suite_event_type: "dev.agentpod.gate.progress.v2",
    schema_version: 1,
    gate_id: "gate_8f3a",
    board_id: "brd_7c1f",
    card_id: "crd_6b40",
    approved_by: "rakesh",
    approval: { principal_id: "prn_a", at: TS },
    quorum: {
      required: 2,
      from: "deciders",
      approvals: [{ principal_id: "prn_a", at: TS }],
    },
    ...ref,
  };
  bad(
    "dev.agentpod.gate.progress.v2",
    "a quorum of one: a gate that passes on one approval sends no progress",
    { ...progress, quorum: { ...progress.quorum, required: 1 } },
  );
  bad(
    "dev.agentpod.gate.progress.v2",
    "a reply relation: progress references the gate's own event",
    {
      ...progress,
      "m.relates_to": { "m.in_reply_to": { event_id: "$gateEvent" } },
    },
  );
  bad(
    "dev.agentpod.gate.progress.v2",
    "one person counted twice",
    {
      ...progress,
      quorum: {
        ...progress.quorum,
        approvals: [progress.approval, progress.approval],
      },
    },
    "unique",
  );
  const released = {
    suite_event_type: "dev.agentpod.decision.released.v2",
    schema_version: 1,
    gate_id: "gate_8f3a",
    board_id: "brd_7c1f",
    card_id: "crd_6b40",
    outcome: "released",
    released_at: TS,
    ...ref,
  };
  bad(
    "dev.agentpod.decision.released.v2",
    "an outcome other than released or blocked",
    { ...released, outcome: "expired" },
  );
  bad(
    "dev.agentpod.decision.released.v2",
    "a reason on a release that went ahead",
    { ...released, reason: "it went ahead" },
  );
  bad(
    "dev.agentpod.decision.released.v2",
    "a release time that is not a time",
    { ...released, released_at: "Monday" },
  );
  const pulled = {
    suite_event_type: "dev.agentpod.decision.pulled_back.v2",
    schema_version: 1,
    gate_id: "gate_8f3a",
    board_id: "brd_7c1f",
    card_id: "crd_6b40",
    pulled_back_by: "rakesh",
    comment: "wrong image",
    at: TS,
    ...ref,
  };
  bad(
    "dev.agentpod.decision.pulled_back.v2",
    "a blank comment: a pull-back always says why",
    { ...pulled, comment: "" },
  );
  bad(
    "dev.agentpod.decision.pulled_back.v2",
    "no reference to the gate's event",
    (({ "m.relates_to": _m, ...rest }) => rest)(pulled),
  );

  const p = {
    schema_version: 1,
    session_id: "acps_1",
    request_seq: 4,
    title: "Run bun test",
    options: [{ option_id: "allow", name: "Allow once" }],
  };
  for (const type of [
    "dev.agentpod.permission",
    "dev.agentpod.permission.v1",
  ]) {
    bad(type, "schema_version 2: a breaking change mints a new key", {
      ...p,
      schema_version: 2,
    });
    bad(type, "five options: a client draws four buttons", {
      ...p,
      options: [1, 2, 3, 4, 5].map((n) => ({
        option_id: `o${n}`,
        name: `${n}`,
      })),
    });
    bad(type, "a negative request_seq", { ...p, request_seq: -1 });
  }
}

/**
 * Invalid cases made from a valid one by breaking one rule, for the rules no source case breaks.
 * Taken from the first valid case that has what the rule is about, so they track the builders.
 */
function derivedInvalid(out: Examples): void {
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

export function buildExamples(): unknown {
  const schemas: Examples = {};
  fromSourceCorpus(schemas);
  built(schemas);
  cardInvalid(schemas);
  derivedInvalid(schemas);
  const sorted = Object.fromEntries(
    Object.entries(schemas).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return {
    corpus: "matrix-events",
    version: 1,
    generatedBy: "scripts/matrix-examples.ts; do not edit by hand",
    sources: [
      "fixtures/ecosystem-identity/matrix_gate_events.json (version 11): every accept and reject case",
      "content built by @superjackfruitlabs/treaty-matrix-events from bodies SuperPipeline sends (labels starting `built:`)",
    ],
    howToRead: {
      valid:
        "Content a sender may emit and a reader must handle, keyed by what it shows.",
      invalid:
        "Content a sender must not emit and a carrier must not act on. `refusedBy` says what refuses it: `schema` (the type's JSON Schema), `unique` (an `x-uniqueBy` rule of that schema), or `recorded` (only the carrier, against what it recorded when it posted: an option it did not offer, a binding to another subject). A renderer's obligation is narrower: offer no decision it cannot honestly resolve.",
    },
    schemas: sorted,
  };
}

if (import.meta.main) {
  writeFileSync(EXAMPLES_PATH, `${JSON.stringify(buildExamples(), null, 2)}\n`);
  console.log(`wrote ${EXAMPLES_PATH}`);
}
