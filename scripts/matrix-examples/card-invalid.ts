/** The invalid cases for the v1 cards and the receipts the source corpus pins only valid cases of. */

import {
  elicitationRequestCard,
  gateRequestCard,
} from "../../packages/matrix-events/src/index.ts";
import { LINK, TS, gate, question } from "./inputs.ts";
import type { Invalid, Examples } from "./types.ts";

/** Invalid cases the source corpus does not hold: the v1 cards, and the receipts it pins only valid cases of. */
export function cardInvalid(out: Examples): void {
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
