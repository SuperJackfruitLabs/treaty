import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "../src/check.ts";
import {
  attentionV2Content,
  boardRoomAlias,
  boardRoomNames,
  boardSpeakerMxid,
  deliveryV2Content,
  gateEventContent,
  gateOptionsV2,
  gateSubjectV2,
  gateV2Content,
  isSubjectExpiry,
  parseGateDecision,
  parseQuestionAnswer,
  permissionOptionsV2,
  questionOptionsV2,
  SUBJECT_EXPIRY_PATTERN,
  subjectV2,
  uniqueByViolations,
  type AttentionPendingDelivery,
  type DeliveryPendingDelivery,
  type ElicitationPendingDelivery,
  type GatePendingDelivery,
} from "../src/index.ts";

const gate = (
  over: Partial<GatePendingDelivery> = {},
): GatePendingDelivery => ({
  event: "gate.pending",
  boardId: "brd_1",
  cardId: "crd_1",
  gateId: "gate_1",
  stageKey: "review",
  returnStageKey: "draft",
  cardTitle: "Ship it",
  producedBy: "agt_1",
  options: [
    { id: "approve", label: "Approve" },
    { id: "request_changes", label: "Request changes" },
    { id: "reject", label: "Reject" },
  ],
  ts: "2030-01-01T00:00:00Z",
  ...over,
});

const subject = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  digest: "sha256:1",
  schema: "x-post/v1",
  revision: 1,
  expiresAt: null,
  preview: [{ type: "text", label: "Post", text: "Hello" }],
  previewComplete: true,
  ...over,
});

describe("the validator behind the moved code (zod 4's semantics)", () => {
  test("an object strips keys it does not declare and leaves out an absent optional one", () => {
    const S = z.object({ a: z.string(), b: z.string().optional() });
    expect(S.safeParse({ a: "x", extra: 1 })).toEqual({
      success: true,
      data: { a: "x" },
    });
  });
  test("an object refuses an array, and a required key that is absent", () => {
    const S = z.object({ a: z.string() });
    expect(S.safeParse([]).success).toBe(false);
    expect(S.safeParse({}).success).toBe(false);
  });
  test("a number refuses NaN and Infinity; int takes only a safe integer", () => {
    expect(z.number().safeParse(Number.NaN).success).toBe(false);
    expect(z.number().safeParse(Infinity).success).toBe(false);
    expect(
      z
        .number()
        .int()
        .safeParse(2 ** 53).success,
    ).toBe(false);
    expect(z.number().int().safeParse(3).success).toBe(true);
  });
  test("catch turns a failure into its fallback, and transform runs only after the checks pass", () => {
    expect(z.enum(["a"]).optional().catch(undefined).safeParse("b")).toEqual({
      success: true,
      data: undefined,
    });
    expect(
      z
        .string()
        .max(2)
        .transform((v) => v.toUpperCase())
        .safeParse("abc").success,
    ).toBe(false);
  });
  test("a discriminated union reads only the option its tag names", () => {
    const U = z.discriminatedUnion("type", [
      z.object({ type: z.literal("a"), x: z.string() }),
      z.object({ type: z.literal("b"), y: z.string() }),
    ]);
    expect(U.safeParse({ type: "b", y: "1" }).success).toBe(true);
    expect(U.safeParse({ type: "a", y: "1" }).success).toBe(false);
  });
});

describe("a gate", () => {
  test("its v1 card never offers an approval on a subject-bound gate: a v1 answer carries no binding", () => {
    const card = gateEventContent(gate({ approvalSubject: subject() }));
    expect((card.options as Array<{ id: string }>).map((o) => o.id)).toEqual([
      "request_changes",
      "reject",
    ]);
  });

  test("an older board's options get a meaning derived from their id", () => {
    expect(
      gateOptionsV2(gate()).map((o) => [o.id, o.meaning, o.needs_comment]),
    ).toEqual([
      ["approve", "approve", false],
      ["request_changes", "revise", true],
      ["reject", "reject", false],
    ]);
  });

  test("a subject it cannot carry takes every approving option away", () => {
    const g = gate({ approvalSubject: { id: "", digest: "d" } });
    expect(gateOptionsV2(g).some((o) => o.meaning === "approve")).toBe(false);
  });

  test("a subject whose revision is not a whole number is not carried, and takes the approvals with it", () => {
    const d = gate({ approvalSubject: subject({ revision: 1.5 }) });
    expect(gateSubjectV2(d)).toBeNull();
    expect(gateOptionsV2(d).map((o) => o.id)).toEqual([
      "request_changes",
      "reject",
    ]);
    expect(
      gateSubjectV2(gate({ approvalSubject: subject({ revision: 0 }) })),
    ).not.toBeNull();
  });
  test("a preview cut here is not complete, though the board said it was", () => {
    const s = gateSubjectV2(
      gate({
        approvalSubject: subject({
          preview: [{ type: "text", text: "x".repeat(4001) }],
        }),
      }),
    );
    expect(s?.preview_complete).toBe(false);
  });

  test("a repeated option id keeps its first entry", () => {
    const g = gate({
      options: [
        { id: "approve", label: "A" },
        { id: "approve", label: "B" },
      ],
    });
    expect(gateOptionsV2(g)).toHaveLength(1);
  });

  test("a variant gate's subject carries the variants and no identity of its own", () => {
    const content = gateV2Content(
      gate({
        approvalSubject: {
          variants: [{ id: "a", label: "Short", subject: subject() }],
        },
      }),
    );
    expect(content.subject).toMatchObject({
      variants: [{ id: "a", label: "Short" }],
    });
    expect(content.subject).not.toHaveProperty("id");
  });
});

describe("a question, a follow-up and a waiting card", () => {
  test("a question bound to a subject it cannot carry offers no approval", () => {
    const q: ElicitationPendingDelivery = {
      event: "elicitation.pending",
      boardId: "b",
      cardId: "c",
      cardTitle: "t",
      elicitationId: "e",
      runId: "r",
      stageKey: "s",
      agentId: "a",
      question: "?",
      options: [
        { id: "yes", label: "Yes", meaning: "approve" },
        { id: "no", label: "No", meaning: "reject" },
      ],
      approvalSubject: "not a subject",
      ts: "t",
    };
    expect(questionOptionsV2(q).map((o) => o.id)).toEqual(["no"]);
  });

  test("switching to automatic delivery is withheld when the preview did not reach the room whole", () => {
    const d: DeliveryPendingDelivery = {
      event: "delivery.pending",
      boardId: "b",
      cardId: "c",
      cardTitle: "t",
      gateId: "g",
      stageKey: "s",
      approvalSubject: subject({ previewComplete: false }),
      options: [
        { id: "record_live_url", label: "Record" },
        { id: "switch_to_automatic", label: "Switch" },
      ],
      ts: "t",
    };
    expect(
      (deliveryV2Content(d).options as Array<{ id: string }>).map((o) => o.id),
    ).toEqual(["record_live_url"]);
  });

  test("a waiting card offers no forward move: it skips the stage's work", () => {
    const a: AttentionPendingDelivery = {
      event: "attention.pending",
      boardId: "b",
      cardId: "c",
      cardTitle: "t",
      stageKey: "s",
      waitId: "w",
      reason: "blocked",
      options: [
        { id: "resume_here", label: "Resume" },
        { id: "move_to:done", label: "Move to done" },
      ],
    };
    expect(
      (attentionV2Content(a).options as Array<{ id: string }>).map((o) => o.id),
    ).toEqual(["resume_here"]);
  });
});

describe("a permission", () => {
  test("carries the first twenty options a harness offered, in its order", () => {
    const offered = Array.from({ length: 25 }, (_, n) => ({
      optionId: `o${n}`,
      name: `Option ${n}`,
      kind: "allow_once",
    }));
    const ids = permissionOptionsV2(offered).map((o) => o.id);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("o0");
    expect(ids[19]).toBe("o19");
  });
});

describe("answers", () => {
  test("a quoted reply is not a reference: m.in_reply_to binds nothing", () => {
    const parsed = parseGateDecision({
      suite_event_type: "dev.superpipeline.gate.decision.v1",
      gate_id: "gate_1",
      option_id: "approve",
      "m.relates_to": { "m.in_reply_to": { event_id: "$gate" } },
    });
    expect(parsed?.referencedEventId).toBeNull();
  });

  test("a v1 decision takes only the three GateDecision ids; v2 takes any", () => {
    const v1 = {
      suite_event_type: "dev.superpipeline.gate.decision.v1",
      gate_id: "g",
      option_id: "ship_it",
    };
    expect(parseGateDecision(v1)).toBeNull();
    expect(
      parseGateDecision({
        ...v1,
        suite_event_type: "dev.superpipeline.gate.decision.v2",
      })?.optionId,
    ).toBe("ship_it");
  });

  test("a blank text answer is no text", () => {
    const parsed = parseQuestionAnswer({
      suite_event_type: "dev.superpipeline.question.answer.v2",
      elicitation_id: "e",
      text: "  ",
    });
    expect(parsed?.text).toBeNull();
  });
});

describe("x-uniqueBy", () => {
  test("names each path whose values repeat", () => {
    const content = {
      options: [{ id: "a" }, { id: "a" }],
      checks: [{ name: "x" }],
    };
    expect(
      uniqueByViolations(content, ["options[].id", "checks[].name"]),
    ).toEqual(["options[].id"]);
  });
  test("steps through nested lists", () => {
    const content = {
      subject: {
        variants: [{ subject: { id: "s" } }, { subject: { id: "s" } }],
      },
    };
    expect(
      uniqueByViolations(content, ["subject.variants[].subject.id"]),
    ).toEqual(["subject.variants[].subject.id"]);
  });
});

describe("board rooms", () => {
  test("a board's alias and speaker keep the names existing rooms have", () => {
    expect(boardRoomAlias("brd_7c1f")).toBe("agentpod_board_brd_7c1f");
    expect(boardRoomAlias("brd 1/x")).toBe("agentpod_board_brd_1_x");
    expect(boardSpeakerMxid("id.agentpod.dev")).toBe(
      "@agent_superpipeline:id.agentpod.dev",
    );
  });

  test("agentpod's set is exactly the names existing rooms have", () => {
    const names = boardRoomNames("agentpod");
    for (const id of ["brd_7c1f", "brd 1/x"])
      expect(names.alias(id)).toBe(boardRoomAlias(id));
    expect(names.speakerMxid("id.agentpod.dev")).toBe(
      boardSpeakerMxid("id.agentpod.dev"),
    );
  });

  test("superexchange's names sit in its own exclusive namespace, apart from agentpod's", () => {
    const names = boardRoomNames("superexchange");
    expect(names.alias("brd 1/x")).toBe("superexchange_board_brd_1_x");
    expect(names.speakerMxid("staging-id.agentpod.dev")).toBe(
      "@superexchange_board:staging-id.agentpod.dev",
    );
    // The registrations' exclusive patterns: each carrier's names match its own and never the other's.
    const own = { user: /^@superexchange_.*:/, alias: /^#superexchange_.*:/ };
    const hubs = { user: /^@agent_.*:/, alias: /^#agentpod_.*:/ };
    const mxid = names.speakerMxid("d");
    const alias = `#${names.alias("brd_1")}:d`;
    expect([own.user.test(mxid), own.alias.test(alias)]).toEqual([true, true]);
    expect([hubs.user.test(mxid), hubs.alias.test(alias)]).toEqual([
      false,
      false,
    ]);
  });
});

describe("a subject's expiry is strict (RFC 3339, seconds and an offset)", () => {
  // The lists SuperPipeline's own subject-expiry test holds: what it sends, and what it refuses.
  const ACCEPTED = [
    "2030-01-02T03:04:05Z",
    "2030-01-02T03:04:05.123Z",
    "2030-01-02T08:34:05+05:30",
    "2030-01-01T22:04:05-05:00",
  ];
  const REFUSED = [
    "2030-01-02",
    "Jan 2 2030",
    "Wed, 02 Jan 2030 03:04:05 GMT",
    "2030-01-02T03:04:05",
    "2030-01-02T03:04Z",
    "2030-01-02 03:04:05Z",
    "2030-01-02T03:04:05+0530",
    "2030-01-02t03:04:05z",
    "2030-02-30T03:04:05Z",
    "1893553445000",
    "",
  ];
  const subject = (expiresAt: unknown) => ({
    id: "aps_1",
    digest: "sha256:1",
    schema: "social-publish/v1",
    revision: 1,
    expiresAt,
    preview: [{ type: "text", text: "hello" }],
    previewComplete: true,
  });

  test.each(ACCEPTED)("isSubjectExpiry accepts %s", (v) =>
    expect(isSubjectExpiry(v)).toBe(true),
  );
  test.each(REFUSED)("isSubjectExpiry refuses %j", (v) =>
    expect(isSubjectExpiry(v)).toBe(false),
  );

  test.each(ACCEPTED)("subjectV2 carries %s unchanged", (v) =>
    expect(subjectV2(subject(v))?.expires_at).toBe(v),
  );
  test.each(REFUSED)(
    "subjectV2 refuses a subject whose expiry is %j, so no approving option is offered",
    (v) => {
      expect(subjectV2(subject(v))).toBeNull();
      const d = gate({
        options: [
          { id: "approve", label: "Approve", meaning: "approve" },
          { id: "reject", label: "Reject", meaning: "reject" },
        ],
        approvalSubject: subject(v),
      });
      expect(gateSubjectV2(d)).toBeNull();
    },
  );

  test("no expiry, or one that is not a string, is still read as none", () => {
    expect(subjectV2(subject(null))?.expires_at).toBeNull();
    expect(subjectV2(subject(undefined))?.expires_at).toBeNull();
    const { expiresAt: _, ...absent } = subject(null);
    expect(subjectV2(absent)?.expires_at).toBeNull();
    expect(subjectV2(subject(1893553445000))?.expires_at).toBeNull();
  });

  test("the schemas carry the same pattern and format", () => {
    for (const name of [
      "dev.superpipeline.gate.v2",
      "dev.superpipeline.question.v2",
      "dev.superpipeline.delivery.v2",
      "dev.agentpod.permission.v2",
    ]) {
      const schema = JSON.parse(
        readFileSync(
          join(import.meta.dir, `../../../schemas/matrix/${name}.json`),
          "utf8",
        ),
      );
      const e = schema.$defs.subject.properties.expires_at;
      expect({ name, pattern: e.pattern, format: e.format }).toEqual({
        name,
        pattern: SUBJECT_EXPIRY_PATTERN,
        format: "date-time",
      });
    }
  });
});
