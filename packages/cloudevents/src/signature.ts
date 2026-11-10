/**
 * Signed HTTP delivery: how the relay proves to a Worker that an event came from it.
 *
 * The header is `t=<unix seconds>,v1=<hex HMAC-SHA256>`, over `<t>.<event id>.<body>`. Binding
 * the id stops a captured body from being replayed under another id, and the timestamp bounds
 * how long a captured request is accepted. Web Crypto only, so it runs in Workers, Bun and Node.
 */
import { CloudEventError } from "./encoding.ts";

export const SIGNATURE_HEADER = "x-treaty-signature";

const UTF8 = new TextEncoder();

async function hmac(
  secret: string,
  t: number,
  id: string,
  body: Uint8Array,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    UTF8.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prefix = UTF8.encode(`${t}.${id}.`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix);
  message.set(body, prefix.length);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signDelivery(
  secret: string,
  id: string,
  body: Uint8Array,
  nowMs = Date.now(),
): Promise<string> {
  const t = Math.floor(nowMs / 1000);
  return `t=${t},v1=${await hmac(secret, t, id, body)}`;
}

/** Throws unless `header` signs this id and body with `secret`, within `toleranceSeconds` of now. */
export async function verifyDelivery(
  secret: string,
  header: string | null,
  id: string,
  body: Uint8Array,
  {
    nowMs = Date.now(),
    toleranceSeconds = 300,
  }: { nowMs?: number; toleranceSeconds?: number } = {},
): Promise<void> {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? "");
  if (!match) throw new CloudEventError("missing or malformed signature");
  const t = Number(match[1]);
  if (Math.abs(nowMs / 1000 - t) > toleranceSeconds)
    throw new CloudEventError("signature timestamp outside tolerance");
  const expected = await hmac(secret, t, id, body);
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ match[2]!.charCodeAt(i);
  if (diff !== 0) throw new CloudEventError("signature does not match");
}
