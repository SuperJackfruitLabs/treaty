/**
 * Staging only: a subscriber that stands in for a Worker. It checks each delivery's signature
 * with verifyDelivery, as a Worker would, and keeps the ids it accepted, so the smoke can see
 * an event arrive once and signed. It answers 401 to a delivery that is not signed by the relay.
 */
import { verifyDelivery } from "../../packages/cloudevents/src/index.ts";

const secret = process.env["SINK_SECRET"];
if (!secret) throw new Error("SINK_SECRET is not set");
const received: string[] = [];

Bun.serve({
  port: 9000,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/received")
      return Response.json(received);
    if (request.method !== "POST" || path !== "/events")
      return new Response(null, { status: 404 });
    const body = new Uint8Array(await request.arrayBuffer());
    const id = request.headers.get("ce-id") ?? "";
    try {
      await verifyDelivery(
        secret,
        request.headers.get("x-treaty-signature"),
        id,
        body,
      );
    } catch {
      return new Response(null, { status: 401 });
    }
    received.push(id);
    return new Response(null, { status: 204 });
  },
});
console.log("sink: listening on :9000");
