import { expect, test } from "bun:test";
import corpus from "../fixtures/superbench-api/private-execution-io.json";
import {
  exactBase64,
  finiteRequest,
  finiteRequestDigest,
  finiteResponse,
  finiteReceipt,
  registrationRequest,
  registrationResponse,
  IO_CONTENT_TYPE,
  MAX_IO,
  MAX_PROFILE_BODY,
  sha256,
} from "./superbench-private-io-validation";
import { strictDecode } from "./superbench-workspace-api-validation";

const raw = (value: unknown) => JSON.stringify(value);
const clone = <T>(value: T): T => structuredClone(value);
const request = () => clone(corpus.request);
const response = () => clone(corpus.response.body);
const profile = IO_CONTENT_TYPE;

for (const vector of corpus.lexical)
  test(`strict lexical refusal ${vector.name}`, () => {
    const bytes = Buffer.concat([
      Buffer.from(vector.prefix_hex, "hex"),
      Buffer.from(raw(request())),
    ]);
    expect(() => finiteRequest(bytes, profile)).toThrow(vector.error);
    expect(() => finiteRequest(bytes.toString("utf8"), profile)).toThrow(
      vector.error,
    );
  });

for (const vector of corpus.observation_errors)
  test(`observation error status ${vector.code}`, () => {
    const body = {
      version: "superbench.v2",
      operation: "registration_observe",
      ok: false,
      error: { code: vector.code, message: "Observation unavailable." },
    };
    for (const status of vector.statuses)
      expect(
        registrationResponse(raw(body), corpus.observation_request, status),
      ).toEqual(body);
    expect(() =>
      registrationResponse(raw(body), corpus.observation_request, 200),
    ).toThrow("http_status");
  });

for (const vector of corpus.invalid_requests)
  test(`shared request refusal ${vector.name}`, () => {
    expect(() => finiteRequest(raw(vector.body), profile)).toThrow();
  });
for (const vector of corpus.request_digests)
  test(`shared typed digest ${vector.name}`, () => {
    expect(finiteRequestDigest(raw(vector.body), profile)).toBe(vector.sha256);
    expect(sha256(Buffer.from(vector.canonical))).toBe(vector.sha256);
  });

for (const vector of corpus.base64)
  test(`base64 exact ${vector.hex}`, () => {
    expect(
      Buffer.from(exactBase64(vector.encoded, MAX_IO)).toString("hex"),
    ).toBe(vector.hex);
  });
for (const encoded of corpus.invalid_base64)
  test(`refuse base64 ${JSON.stringify(encoded)}`, () => {
    expect(() => exactBase64(encoded, MAX_IO)).toThrow();
  });

test("profile is explicit and legacy budget remains unchanged", () => {
  const q = request();
  q.io.stdin_base64 = Buffer.alloc(MAX_IO).toString("base64");
  expect(finiteRequest(raw(q), profile)).toEqual(q);
  expect(
    finiteRequest(
      raw(q),
      'application/json; profile="superbench.finite-io.v1"',
    ),
  ).toEqual(q);
  expect(() => strictDecode(raw(q))).toThrow("request_size");
  for (const value of [
    "application/json",
    profile + "; profile=superbench.finite-io.v1",
    profile + "; charset=utf-8",
    "application/json; profile=unknown",
  ])
    expect(() => finiteRequest(raw(q), value)).toThrow("profile");
  q.io.stdin_base64 = Buffer.alloc(MAX_IO + 1).toString("base64");
  expect(() => finiteRequest(raw(q), profile)).toThrow();
});

test("raw byte boundary and strict aliases duplicates nulls versions", () => {
  const q = raw(request());
  expect(
    finiteRequest(
      q + " ".repeat(MAX_PROFILE_BODY - Buffer.byteLength(q)),
      profile,
    ),
  ).toEqual(request());
  expect(() =>
    finiteRequest(
      q + " ".repeat(MAX_PROFILE_BODY - Buffer.byteLength(q) + 1),
      profile,
    ),
  ).toThrow("private_size");
  for (const value of [
    q.replace('"io":', '"scope":"asserted","io":'),
    q.replace(
      '"version":"superbench.v2"',
      '"version":"superbench.v2","version":"superbench.v2"',
    ),
    q.replace('"io":{', '"io":null,"alias":{'),
    q.replace("finite-io.v1", "finite-io.v2"),
    q.replace('"operation":"run"', '"operation":"setup"'),
  ])
    expect(() => finiteRequest(value, profile)).toThrow();
  expect(() => finiteRequest(new Uint8Array([0xff]), profile)).toThrow();
});

test("typed digest ignores raw order but binds exact IO bytes limit and version", () => {
  const q = request();
  const digest = finiteRequestDigest(raw(q), profile);
  expect(
    finiteRequestDigest(
      raw(Object.fromEntries(Object.entries(q).toReversed())),
      profile,
    ),
  ).toBe(digest);
  for (const update of [{ stdin_base64: "" }, { stdout_limit_bytes: 1 }]) {
    const changed = request();
    Object.assign(changed.io, update);
    expect(finiteRequestDigest(raw(changed), profile)).not.toBe(digest);
  }
  q.arguments = ["<>&\u2028\u2029"];
  const canonical = raw(q).replace(
    /[<>&\u2028\u2029]/gu,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  expect(finiteRequestDigest(raw(q), profile)).toBe(
    sha256(Buffer.from(canonical)),
  );
});

test("exact stopped stdout and nonzero exit retain independent task semantics", () => {
  expect(
    finiteResponse(
      raw(response()),
      profile,
      request(),
      422,
      corpus.response.expected,
    ),
  ).toEqual(response());
  for (const change of [
    "hash",
    "count",
    "limit",
    "running",
    "missing",
    "unknown",
    "truncated",
  ]) {
    const q = request();
    const r = response();
    if (change === "hash") r.result.io.stdout_sha256 = "0".repeat(64);
    if (change === "count") r.result.io.stdout_bytes = 2;
    if (change === "limit") q.io.stdout_limit_bytes = 1;
    if (change === "running") r.result.execution.phase = "running";
    if (change === "missing") {
      r.ok = true;
      Reflect.deleteProperty(r, "error");
      Reflect.deleteProperty(r.result, "io");
    }
    if (change === "unknown") r.error.code = "operation_in_doubt";
    if (change === "truncated") r.result.io.stdout_base64 = "AAE=";
    expect(() =>
      finiteResponse(
        raw(r),
        profile,
        q,
        change === "missing" ? 200 : 422,
        corpus.response.expected,
      ),
    ).toThrow();
  }
});

test("dependent v2 capacity code has exact 422 mapping without IO success", () => {
  const r = clone(corpus.capacity_response.body);
  expect(
    finiteResponse(raw(r), profile, request(), 422, corpus.response.expected),
  ).toEqual(r);
  expect(() =>
    finiteResponse(raw(r), profile, request(), 503, corpus.response.expected),
  ).toThrow("http_status");
  expect(() =>
    finiteResponse(
      raw({ ...r, error: { ...r.error, code: "future_capacity" } }),
      profile,
      request(),
      422,
      corpus.response.expected,
    ),
  ).toThrow("schema");
  expect(() =>
    finiteResponse(
      raw({ ...response(), error: r.error }),
      profile,
      request(),
      422,
      corpus.response.expected,
    ),
  ).toThrow("uncertain_output");
});

test("stdout empty and maximum are exact observations; one over refuses", () => {
  for (const size of [0, MAX_IO]) {
    const r = response();
    const bytes = Buffer.alloc(size);
    r.result.io = {
      version: "superbench.finite-io.v1",
      stdout_base64: bytes.toString("base64"),
      stdout_bytes: size,
      stdout_sha256: sha256(bytes),
    };
    expect(
      finiteResponse(raw(r), profile, request(), 422, corpus.response.expected),
    ).toEqual(r);
  }
  const r = response();
  const bytes = Buffer.alloc(MAX_IO + 1);
  r.result.io = {
    version: "superbench.finite-io.v1",
    stdout_base64: bytes.toString("base64"),
    stdout_bytes: bytes.length,
    stdout_sha256: sha256(bytes),
  };
  expect(() =>
    finiteResponse(raw(r), profile, request(), 422, corpus.response.expected),
  ).toThrow();
  for (const limit of [0, MAX_IO + 1]) {
    const q = request();
    q.io.stdout_limit_bytes = limit;
    expect(() => finiteRequest(raw(q), profile)).toThrow();
  }
});

test("receipt joins exact original status bytes target and parks absent", () => {
  const body = raw(response());
  const target = { request_id: "run-1", digest: "a".repeat(64) };
  const receipt = {
    version: "superbench.v2",
    operation: "receipt_lookup",
    ok: true,
    result: {
      target_request_id: target.request_id,
      target_digest: target.digest,
      state: "completed",
      http_status: 422,
      response_body: body,
    },
  };
  expect(finiteReceipt(raw(receipt), profile, target, body, 422)).toEqual(
    receipt,
  );
  expect(() => finiteReceipt(raw(receipt), profile, target, body, 200)).toThrow(
    "lookup_original",
  );
  expect(() =>
    finiteReceipt(raw(receipt), profile, target, body + " ", 422),
  ).toThrow("lookup_original");
  expect(() =>
    finiteReceipt(
      raw(receipt),
      profile,
      { ...target, digest: "b".repeat(64) },
      body,
      422,
    ),
  ).toThrow("lookup_target");
  const absent = {
    ...receipt,
    result: {
      target_request_id: target.request_id,
      target_digest: target.digest,
      state: "absent",
    },
  };
  expect(finiteReceipt(raw(absent), profile, target, body, 422)).toEqual(
    absent,
  );
});

test("private complete registration joins request and all physical checkpoint members", () => {
  const q = registrationRequest(raw(corpus.observation_request));
  expect(
    registrationResponse(raw(corpus.observation_response), q, 200),
  ).toEqual(corpus.observation_response);
  for (const change of [
    "key",
    "id",
    "token",
    "device",
    "alias",
    "order",
    "commit",
    "overflow",
    "path",
  ]) {
    const r = clone(corpus.observation_response);
    const result = r.result;
    if (change === "key") result.key = "other";
    if (change === "id") result.bench_id = "2".repeat(32);
    if (change === "token")
      Object.assign(result, { lease_token: "6".repeat(32) });
    if (change === "device") result.root_home.device = "2";
    if (change === "alias") result.root_home = clone(result.root);
    if (change === "order") result.members = result.members.toReversed();
    if (change === "commit") result.checkpoint.members.pop();
    if (change === "overflow") result.root.inode = "18446744073709551616";
    if (change === "path") result.root_path = "/workspace/../benches/card";
    expect(() => registrationResponse(raw(r), q, 200)).toThrow();
  }
});

test("complete 32-member escaped observation fits the total byte budget", () => {
  const r = clone(corpus.observation_response);
  const result = r.result;
  let index = 0n;
  const node = () => ({
    device: "18446744073709551615",
    inode: String(18446744073709551615n - index++),
  });
  result.root = node();
  result.root_home = node();
  result.root_tmp = node();
  result.root_path =
    "/" + "\u0001".repeat(4096 - 1 - "/benches/card".length) + "/benches/card";
  result.members = Array.from({ length: 32 }, (_, i) => ({
    name: `m${String(i).padStart(2, "0")}` + "x".repeat(61),
    checkout: node(),
    admin: node(),
    home: node(),
    tmp: node(),
  }));
  result.checkpoint.members = result.members.map((m) => ({
    name: m.name,
    commit: "c".repeat(64),
  }));
  expect(Buffer.byteLength(result.root_path)).toBe(4096);
  expect(Buffer.byteLength(raw(r))).toBeLessThan(65536);
  expect(registrationResponse(raw(r), corpus.observation_request, 200)).toEqual(
    r,
  );
  expect(() =>
    registrationResponse(
      raw(r) + " ".repeat(65537 - Buffer.byteLength(raw(r))),
      corpus.observation_request,
      200,
    ),
  ).toThrow("private_size");
});
