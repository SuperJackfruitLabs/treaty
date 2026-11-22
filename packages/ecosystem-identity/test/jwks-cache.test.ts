import { expect, test } from "bun:test";
import { createJwksCache } from "../src/index.ts";

function server() {
  const state = { calls: 0, down: false, keys: [{ kid: "k1" }] };
  const fetchImpl: typeof fetch = Object.assign(
    async () => {
      state.calls++;
      if (state.down) throw new Error("ECONNREFUSED");
      return Response.json({ keys: state.keys });
    },
    { preconnect: fetch.preconnect },
  );
  return { state, fetchImpl };
}

test("fetches once, serves the cache, and refetches an unknown kid at most once per 30 s", async () => {
  const { state, fetchImpl } = server();
  let clock = 1_000_000;
  const cache = createJwksCache({
    url: "https://x/jwks",
    fetch: fetchImpl,
    now: () => clock,
  });
  await cache.getKeys("k1");
  await cache.getKeys("k1");
  expect(state.calls).toBe(1);
  await cache.getKeys("k2");
  expect(state.calls).toBe(2);
  clock += 29_999;
  await cache.getKeys("k2");
  expect(state.calls).toBe(2);
  clock += 1;
  state.keys = [{ kid: "k1" }, { kid: "k2" }];
  expect(await cache.getKeys("k2")).toEqual({ keys: state.keys });
  expect(state.calls).toBe(3);
});

test("serves a stale set at once and refreshes it behind; keeps the last good set when the issuer is down", async () => {
  const { state, fetchImpl } = server();
  let clock = 0;
  const cache = createJwksCache({
    url: "https://x/jwks",
    fetch: fetchImpl,
    now: () => clock,
    maxAgeMs: 1000,
  });
  await cache.getKeys("k1");
  state.down = true;
  clock = 5000;
  expect(await cache.getKeys("k1")).toEqual({ keys: [{ kid: "k1" }] });
  expect(state.calls).toBe(2);
});

test("throws when it never had a set", async () => {
  const { state, fetchImpl } = server();
  state.down = true;
  const cache = createJwksCache({ url: "https://x/jwks", fetch: fetchImpl });
  expect(await cache.getKeys("k1").catch((e: unknown) => e)).toBeInstanceOf(
    Error,
  );
});

test("gives up on a fetch after timeoutMs", async () => {
  const hang: typeof fetch = Object.assign(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
    { preconnect: fetch.preconnect },
  );
  const cache = createJwksCache({
    url: "https://x/jwks",
    fetch: hang,
    timeoutMs: 20,
  });
  const started = Date.now();
  expect(await cache.getKeys("k1").catch((e: unknown) => e)).toBeInstanceOf(
    Error,
  );
  expect(Date.now() - started).toBeLessThan(1000);
});
