import { describe, expect, test } from "bun:test";
import {
  eventSubject,
  eventType,
  parseSubject,
  parseType,
} from "../src/index.ts";

const card = { product: "superpipeline", entity: "card", verb: "completed" };

describe("subjects", () => {
  test("follow evt.<workspace>.<product>.<entity>.<verb> and parse back", () => {
    const subject = eventSubject("ws_123", card);
    expect(subject).toBe("evt.ws_123.superpipeline.card.completed");
    expect(parseSubject(subject)).toEqual({ workspace: "ws_123", ...card });
  });

  test("carry no version", () => {
    expect(() =>
      eventSubject("ws_123", { ...card, verb: "completed.v1" }),
    ).toThrow();
  });

  for (const bad of ["ws.1", "ws*", ">", "", "ws 1"]) {
    test(`refuse workspace ${JSON.stringify(bad)}`, () => {
      expect(() => eventSubject(bad, card)).toThrow();
    });
  }

  for (const bad of [
    "evt.ws.superpipeline.card",
    "evt.ws.superpipeline.card.completed.extra",
    "x.ws.a.b.c",
  ]) {
    test(`refuse to parse ${bad}`, () => {
      expect(() => parseSubject(bad)).toThrow();
    });
  }
});

describe("types", () => {
  test("follow com.superjackfruit.<product>.<entity>.<verb>.v<N> and parse back", () => {
    const type = eventType(card, 1);
    expect(type).toBe("com.superjackfruit.superpipeline.card.completed.v1");
    expect(parseType(type)).toEqual({ ...card, version: 1 });
  });

  for (const version of [0, -1, 1.5]) {
    test(`refuse version ${version}`, () => {
      expect(() => eventType(card, version)).toThrow();
    });
  }

  for (const bad of [
    "com.superjackfruit.superpipeline.card.completed",
    "com.example.a.b.c.v1",
    "com.superjackfruit.Super.card.completed.v1",
    "com.superjackfruit.a.b.c.v01",
  ]) {
    test(`refuse to parse ${bad}`, () => {
      expect(() => parseType(bad)).toThrow();
    });
  }
});
