/** The SuperPipeline bodies the built cases are made from. */

import {
  type AttentionPendingDelivery,
  type DeliveryPendingDelivery,
  type ElicitationPendingDelivery,
  type GatePendingDelivery,
  type GateSubjectV2,
} from "../../packages/matrix-events/src/index.ts";

// ── Built by this package, from bodies SuperPipeline sends ───────────────────

export const LINK = "https://superpipeline.dev/b/brd_7c1f/c/crd_6b40";
export const TS = "2030-01-01T09:00:00.000Z";

export const gate = (
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

export const post = {
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

export const publishing = [
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

export const question = (
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

export const delivery = (
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

export const attention = (
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

export const permissionSubject: GateSubjectV2 = {
  id: "acps_1:4",
  digest: "c0ffee",
  schema: "harness-permission/v1",
  revision: 1,
  expires_at: "2030-01-01T09:30:00.000Z",
  preview: [{ type: "text", label: "Command", text: "bun test" }],
  preview_complete: true,
};
