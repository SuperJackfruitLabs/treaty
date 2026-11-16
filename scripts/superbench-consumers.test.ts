import { expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cardJoin,
  decodeConsumer,
  localityMatches,
  type CardBinding,
  type Locality,
} from "./superbench-consumer-validation";
const read = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
type Case = { name: string; schema: string; body: unknown };
const corpus: { status: string; valid: Case[]; invalid: Case[] } = read(
  "fixtures/superbench-consumers/cases.json",
);
const schemas = new Map(
  ["card-binding", "locality", "lifecycle"].map((name) => [
    name,
    new Validator(
      read(`schemas/superbench-consumers/${name}.v1.json`),
      "2020-12",
      false,
    ),
  ]),
);
for (const [cases, accepted] of [
  [corpus.valid, true],
  [corpus.invalid, false],
] as const)
  for (const c of cases)
    test(`proposed consumer ${accepted ? "accepts" : "refuses"} ${c.name}`, () => {
      expect(schemas.get(c.schema)?.validate(c.body).valid).toBe(accepted);
    });
const binding: CardBinding = {
  tenant: "tenant_1",
  board: "board_1",
  card: "card_42",
  run: "run_2",
  bench: { key: "card_42", bench_id: "77777777777777777777777777777777" },
  host_id: "host_1",
};
const observation = {
  ...binding.bench,
  host: { id: binding.host_id },
  snapshot: "a".repeat(64),
};
test("card association joins exact producer observation", () => {
  expect(cardJoin(binding, binding, observation)).toBe(true);
});
test("card association survives reader snapshot refresh without rebinding", () => {
  const stored = JSON.stringify(binding);
  expect(stored).not.toContain('"snapshot"');
  for (const snapshot of ["a".repeat(64), "b".repeat(64)]) {
    const refreshed = { ...observation, snapshot };
    expect(cardJoin(binding, binding, refreshed)).toBe(true);
    expect(cardJoin(binding, binding, { ...refreshed, key: "another" })).toBe(
      false,
    );
    expect(
      cardJoin(binding, binding, { ...refreshed, bench_id: "8".repeat(32) }),
    ).toBe(false);
  }
  expect(JSON.stringify(binding)).toBe(stored);
});
for (const field of ["tenant", "board", "card", "run", "host_id"] as const)
  test(`card refuses changed authoritative ${field}`, () => {
    expect(
      cardJoin(binding, { ...binding, [field]: "different" }, observation),
    ).toBe(false);
  });
test("key reuse and wrong producer host cannot redirect card", () => {
  expect(
    cardJoin(binding, binding, { ...observation, bench_id: "replacement" }),
  ).toBe(false);
  expect(
    cardJoin(binding, binding, { ...observation, host: { id: "other" } }),
  ).toBe(false);
});
const locality: Locality = {
  bench: binding.bench,
  host_id: binding.host_id,
  snapshot: "a".repeat(64),
  observed_at_ms: 1000,
  expires_at_ms: 301000,
  state: "retained",
  checkpoint_id: "2".repeat(64),
};
const expected = {
  bench: binding.bench,
  host_id: binding.host_id,
  snapshot: "a".repeat(64),
  checkpoint_id: "2".repeat(64),
  phase: "ready",
  availability: "unleased",
};
test("locality requires exact retained confirmed evidence and bounded freshness", () => {
  expect(localityMatches(locality, expected, 1000)).toBe(true);
  expect(
    localityMatches(locality, { ...expected, snapshot: "b".repeat(64) }, 1000),
  ).toBe(false);
  for (const now of [999, 301000, NaN])
    expect(localityMatches(locality, expected, now)).toBe(false);
  expect(
    localityMatches({ ...locality, expires_at_ms: 301001 }, expected, 1000),
  ).toBe(false);
  expect(
    localityMatches({ ...locality, state: "unavailable" }, expected, 1000),
  ).toBe(false);
  expect(
    localityMatches(locality, { ...expected, checkpoint_id: "newer" }, 1000),
  ).toBe(false);
  expect(
    localityMatches(locality, { ...expected, host_id: "other" }, 1000),
  ).toBe(false);
  expect(
    localityMatches(
      locality,
      { ...expected, bench: { ...binding.bench, bench_id: "replacement" } },
      1000,
    ),
  ).toBe(false);
});
test("proposed schemas never enter accepted event catalog", () => {
  const catalog = readFileSync(
    join(import.meta.dir, "../schemas/catalog.json"),
    "utf8",
  );
  expect(catalog.includes("superbench-consumers")).toBe(false);
  expect(corpus.status).toContain("does not prove");
  expect(
    read("fixtures/superbench-consumers/producer-scenarios.json").status,
  ).toContain("unexecuted");
});

test("consumer lexical limits precede schema and joins", () => {
  expect(decodeConsumer("{}" + " ".repeat(65534))).toEqual({});
  expect(() => decodeConsumer("{}" + " ".repeat(65535))).toThrow(
    "consumer_size",
  );
  expect(() => decodeConsumer('{"run":"a","run":"b"}')).toThrow(
    "duplicate_key",
  );
  expect(() => decodeConsumer('{"sequence":1e1}')).toThrow("integer_encoding");
  expect(() => decodeConsumer(new Uint8Array([34, 255, 34]))).toThrow();
});
test("bench, host and checkpoint identity grammar matches the existing reader", () => {
  const reader = read("schemas/superbench/observation-response.v1.json")
    .oneOf[0].properties.result.properties.items.items.properties;
  for (const name of ["card-binding", "locality", "lifecycle"]) {
    const properties = read(
      `schemas/superbench-consumers/${name}.v1.json`,
    ).properties;
    expect(properties.bench.properties.key).toEqual(reader.key);
    expect(properties.bench.properties.bench_id).toEqual(reader.bench_id);
    expect(properties.host_id).toEqual(reader.host.properties.id);
    if (name !== "card-binding")
      expect(properties.checkpoint_id).toEqual(
        reader.checkpoint.oneOf[0].properties.id,
      );
  }
});

test("card panel can omit absent run but cannot adopt an unexpected run", () => {
  const { run, ...withoutRun } = binding;
  expect(run).toBe("run_2");
  expect(cardJoin(withoutRun, withoutRun, observation)).toBe(true);
  expect(cardJoin(withoutRun, binding, observation)).toBe(false);
});
test("card fixture joins the actual existing mixed reader inventory", () => {
  const fixture = read("fixtures/superbench-api/observations.json").valid.find(
    (item: { name: string }) => item.name === "mixed_inventory",
  ).body;
  const item = fixture.result.items[0];
  const association = {
    ...binding,
    bench: { key: item.key, bench_id: item.bench_id },
    host_id: item.host.id,
  };
  expect(
    cardJoin(association, association, { ...item, snapshot: fixture.snapshot }),
  ).toBe(true);
  expect(
    cardJoin(association, association, {
      ...fixture.result.items[1],
      snapshot: fixture.snapshot,
    }),
  ).toBe(false);
});

test("locality cannot promote archived, blocked or transferring observations", () => {
  expect(
    localityMatches(locality, { ...expected, phase: "archived" }, 1000),
  ).toBe(false);
  expect(
    localityMatches(locality, { ...expected, availability: "blocked" }, 1000),
  ).toBe(false);
  expect(
    localityMatches(
      locality,
      { ...expected, transfer_state: "transferred" },
      1000,
    ),
  ).toBe(false);
});
