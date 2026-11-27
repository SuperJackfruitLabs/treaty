/**
 * The AgentPod–Salaam corpora, read whole: every entry is checked against the schema or the
 * operation it exercises, and an entry either side refuses is refused here, by the schema or by
 * the rule in scripts/agentpod-salaam-validation.ts that JSON Schema cannot state.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { validatorFor } from "../packages/contracts/src/schemas.ts";
import {
  assignmentMismatch,
  checkWorkAdmission,
  checkWorkReplay,
  digest,
  duplicateName,
  receiptMismatch,
} from "./agentpod-salaam-validation.ts";

const root = join(import.meta.dir, "..");
const bundle = loadBundle(root);
const C = "fixtures/agentpod-salaam/";
const read = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, C, name), "utf8"));
const DOC = "schemas/http/salaam/operator.v1.openapi.json";
const component = (name: string) =>
  validatorFor(bundle, `${DOC}#/components/schemas/${name}`);
const schema = (file: string, pointer = "") =>
  validatorFor(bundle, `schemas/agentpod-salaam/${file}#${pointer}`);
const valid = (check: ReturnType<typeof component>) => (value: unknown) =>
  check(value).valid;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** The value at a path of keys, or undefined. */
const at = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>(
    (node, key) => (isRecord(node) ? node[key] : undefined),
    value,
  );
const record = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};
const list = (value: unknown, ...keys: string[]): unknown[] => {
  const found = at(value, ...keys);
  if (!Array.isArray(found)) throw new Error(`no ${keys.join(".")}`);
  return found;
};

interface Entry {
  name: string;
  accept: boolean;
  value: unknown;
  request: Record<string, unknown>;
  receipt: Record<string, unknown>;
  /** The whole entry, for the fields a corpus adds. */
  raw: unknown;
}
const entries = (file: unknown, key: string): Entry[] =>
  list(file, key).map((raw) => ({
    name: String(at(raw, "name")),
    accept: at(raw, "accept") === true,
    value: at(raw, "value"),
    request: record(at(raw, "request")),
    receipt: record(at(raw, "receipt")),
    raw,
  }));

describe("fixtures/agentpod-salaam", () => {
  test("every corpus is here and none is unread", () => {
    expect(
      [...bundle.files.keys()].filter((p) => p.startsWith(C)).toSorted(),
    ).toEqual(
      [
        "salaam-acp-v1.json",
        "salaam-authority-v1.json",
        "salaam-board-read-v1.json",
        "salaam-mcp-v1.json",
        "salaam-station-files-v1.json",
        "salaam-work-abandon-v1.json",
        "salaam-work-decision-preview-truncated-v1.json",
        "salaam-work-decision-v1.json",
        "salaam-work-expiry-v1.json",
        "salaam-work-failure-v1.json",
        "salaam-work-payload-v1.json",
        "salaam-work-settlement-v1.json",
        "salaam-work-v1.json",
        "cases.json",
      ]
        .map((n) => C + n)
        .toSorted(),
    );
  });

  test("the authority corpus is a binding strict work accepts", () => {
    const binding = read("salaam-authority-v1.json");
    expect(component("Binding")(binding).errors).toEqual([]);
    expect(component("WorkBinding")(binding).errors).toEqual([]);
  });

  for (const [file, request, receipt] of [
    [
      "salaam-work-settlement-v1.json",
      "SettlementRequest",
      "SettlementReceipt",
    ],
    ["salaam-work-failure-v1.json", "SettlementRequest", "FailureReceipt"],
    ["salaam-work-abandon-v1.json", "SettlementRequest", "AbandonReceipt"],
    ["salaam-work-expiry-v1.json", "ExpiryRequest", "ExpiryReceipt"],
  ] as const) {
    test(`${file}: its request and receipt`, () => {
      const corpus = read(file);
      expect(component(request)(corpus.request).errors).toEqual([]);
      expect(component(receipt)(corpus.receipt).errors).toEqual([]);
    });
  }

  test("the decision corpus: a decision and its digest", () => {
    const corpus = read("salaam-work-decision-v1.json");
    expect(component("WorkDecision")(corpus.decision).errors).toEqual([]);
    expect(digest(corpus.decision)).toBe(String(corpus.decision_digest));
  });

  const truncated = read("salaam-work-decision-preview-truncated-v1.json");
  for (const offer of entries(truncated, "offers"))
    test(`the truncated-preview corpus: ${offer.name}`, () => {
      const decision = at(offer.raw, "decision");
      expect(component("WorkDecision")(decision).errors).toEqual([]);
      expect(digest(decision)).toBe(String(at(offer.raw, "decision_digest")));
    });

  test("the payload corpus: a work payload whose digests are its bytes'", () => {
    const corpus = read("salaam-work-payload-v1.json");
    for (const c of list(corpus, "cases")) {
      const payload = at(c, "payload");
      expect(component("WorkPayload")(payload).errors).toEqual([]);
      expect(digest(at(payload, "input"))).toBe(
        String(at(payload, "admission", "work", "input_digest")),
      );
      expect(digest(at(payload, "plan"))).toBe(
        String(at(payload, "admission", "work", "plan_digest")),
      );
    }
  });

  test("the board-read corpus: pending reads, answers and their bounds", () => {
    const corpus = read("salaam-board-read-v1.json");
    for (const r of list(corpus, "status_excerpt", "board_reads"))
      expect(component("BoardReadRequest")(r).errors).toEqual([]);
    for (const a of list(corpus, "answers"))
      expect(component("BoardReadAnswer")(a).errors).toEqual([]);
    const doc = bundle.files.get(DOC);
    const [ok, refused] = list(
      doc,
      "components",
      "schemas",
      "BoardReadAnswer",
      "oneOf",
    );
    expect(corpus.answer_keys).toEqual({
      ok: list(ok, "required").map(String).toSorted(),
      refused: list(refused, "required").map(String).toSorted(),
    });
    expect(at(ok, "properties", "text", "maxLength")).toBe(
      corpus.max_text_bytes,
    );
    expect(at(refused, "properties", "error", "maxLength")).toBe(
      corpus.max_error_bytes,
    );
  });

  describe("the ACP corpus", () => {
    const corpus = read("salaam-acp-v1.json");
    for (const [key, file] of [
      ["failures", "acp-failure.v1.json"],
      ["cancellations", "acp-cancellation.v1.json"],
      ["features", "acp-execution-features.v1.json"],
    ] as const)
      for (const e of entries(corpus, key))
        test(`${key}: ${e.accept ? "accepts" : "refuses"} ${e.name}`, () => {
          expect(schema(file)(e.value).valid).toBe(e.accept);
        });
  });

  describe("the MCP corpus", () => {
    const corpus = read("salaam-mcp-v1.json");
    const profile = schema("mcp-profile.v1.json");
    const assignment = component("McpAssignment");
    const admission = component("McpAdmission");
    for (const e of entries(corpus, "profiles"))
      test(`profiles: ${e.accept ? "accepts" : "refuses"} ${e.name}`, () => {
        expect(profile(e.value).valid && duplicateName(e.value) === null).toBe(
          e.accept,
        );
      });
    for (const e of entries(corpus, "assignments"))
      test(`assignments: ${e.accept ? "accepts" : "refuses"} ${e.name}`, () => {
        const shaped = assignment(e.value).valid;
        const related =
          shaped &&
          (duplicateName(e.value) ?? assignmentMismatch(record(e.value)));
        expect(shaped && related === null).toBe(e.accept);
      });
    for (const e of entries(corpus, "admissions"))
      test(`admissions: ${e.accept ? "accepts" : "refuses"} ${e.name}`, () => {
        expect(
          admission(e.value).valid && duplicateName(e.value) === null,
        ).toBe(e.accept);
      });
    test("the assignment rule refuses another station's route", () => {
      const good = record(
        entries(corpus, "assignments").find((e) => e.accept)?.value,
      );
      expect(assignmentMismatch(good)).toBeNull();
      expect(
        assignmentMismatch({
          ...good,
          binding: { ...record(good.binding), station_id: "another" },
        }),
      ).toContain("this station's managed route");
    });
  });

  describe("the work corpus", () => {
    const corpus = read("salaam-work-v1.json");
    const admission = valid(component("WorkAdmission"));
    const workBinding = valid(component("WorkBinding"));
    const identity = valid(component("WorkIdentity"));
    const owner = (value: unknown) =>
      value !== null &&
      typeof value === "object" &&
      Object.keys(value).toSorted().join(",") === "binding,work" &&
      workBinding(Reflect.get(value, "binding")) &&
      identity(Reflect.get(value, "work"));
    for (const e of entries(corpus, "admissions"))
      test(`admissions: ${e.accept ? "accepts" : "refuses"} ${JSON.stringify(e.name)}`, () => {
        expect(admission(e.value)).toBe(e.accept);
      });
    for (const e of entries(corpus, "bindings")) {
      const result = String(at(e.raw, "result"));
      test(`bindings: ${e.name} is ${result}`, () => {
        expect(
          checkWorkAdmission(e.value, at(e.raw, "expected"), admission, owner),
        ).toBe(result);
      });
    }
    for (const e of entries(corpus, "replays")) {
      const result = String(at(e.raw, "result"));
      test(`replays: ${e.name} is ${result}`, () => {
        expect(checkWorkReplay(e.value, at(e.raw, "saved"), admission)).toBe(
          result,
        );
      });
    }
  });

  describe("the station-files corpus", () => {
    const corpus = read("salaam-station-files-v1.json");
    const SHA = "3".repeat(64);
    const fill: Record<string, unknown> = {
      $ROOT: "/srv/station",
      $ROOT_IDENTITY: SHA,
      $TREE: "1".repeat(64),
      $SNAPSHOT: "/srv/snapshots/one",
      $DEADLINE: 1792500000000,
    };
    const filled = (r: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          typeof v === "string" && v in fill ? fill[v] : v,
        ]),
      );
    /** Refused by the filesystem as the helper finds it, not by the request's shape. */
    const byFilesystem: Record<string, string> = {
      symlink: "the path is a symlink in the root",
      "wrong-root-identity": "the root's device and inode differ",
    };
    const request = schema("station-files.v1.json", "/$defs/request");
    const receipt = schema("station-files.v1.json", "/$defs/receipt");
    for (const e of entries(corpus, "requests"))
      test(`requests: ${e.accept ? "accepts" : "refuses"} ${e.name}`, () => {
        const shaped = request(filled(e.request)).valid;
        expect(shaped).toBe(e.accept || e.name in byFilesystem);
      });
    for (const e of entries(corpus, "receipts"))
      test(`receipts: ${e.accept ? "accepts" : "refuses"} ${e.name}`, () => {
        const shaped = receipt(e.receipt).valid;
        const why = shaped && receiptMismatch(e.request, e.receipt);
        expect(shaped && why === null).toBe(e.accept);
      });
  });
});
