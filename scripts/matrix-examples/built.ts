/** The valid cases built by this package from the bodies in inputs.ts. */

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
} from "../../packages/matrix-events/src/index.ts";
import {
  LINK,
  TS,
  gate,
  post,
  publishing,
  question,
  delivery,
  attention,
  permissionSubject,
} from "./inputs.ts";
import type { Examples } from "./types.ts";

export function built(out: Examples): void {
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
