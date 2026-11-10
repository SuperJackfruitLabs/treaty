import {
  toBinary,
  type CloudEvent,
} from "../../../packages/cloudevents/src/index.ts";

export const TOKEN = "producer-token";
export const TOKEN_SHA256 = new Bun.CryptoHasher("sha256")
  .update(TOKEN)
  .digest("hex");
export const SUBJECT = "evt.ws_1.superpipeline.gate.pending";

export const event = (
  id = "evt-1",
  type = "com.superjackfruit.superpipeline.gate.pending.v1",
): CloudEvent => ({
  attributes: {
    specversion: "1.0",
    id,
    source: "/boards/brd_1",
    type,
    datacontenttype: "application/json",
  },
  data: new TextEncoder().encode('{"gateId":"gte_1"}'),
});

export function request(
  e: CloudEvent,
  {
    subject = SUBJECT,
    token = TOKEN,
  }: { subject?: string; token?: string | null } = {},
) {
  const wire = toBinary(e, "http");
  const headers: Record<string, string> = { ...wire.headers };
  if (token !== null) headers["authorization"] = `Bearer ${token}`;
  return new Request(`http://relay.test/v1/events/${subject}`, {
    method: "POST",
    headers,
    body: wire.body.slice(),
  });
}
