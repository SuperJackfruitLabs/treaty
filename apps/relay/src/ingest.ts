/**
 * Taking events in: `POST /v1/events/<subject>` with a CloudEvent in HTTP binary mode.
 *
 * The producer is known by its bearer token and may publish only to its own subject patterns.
 * The subject must be a suite subject, and the event's type must name the same product, entity
 * and verb, so a producer cannot file an event under another's name. The event is published to
 * JetStream in NATS binary mode with `Nats-Msg-Id` set to its id, so a resend within the
 * duplicate window is stored once.
 */
import {
  fromBinary,
  parseSubject,
  parseType,
  toBinary,
} from "../../../packages/cloudevents/src/index.ts";
import type { Producer } from "./config.ts";
import { subjectMatches } from "./subjects.ts";

export interface Publisher {
  publish(
    subject: string,
    message: { id: string; headers: Record<string, string>; body: Uint8Array },
  ): Promise<{ duplicate: boolean }>;
}

const MAX_BODY_BYTES = 1024 * 1024;

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ingest(
  producers: Producer[],
  publisher: Publisher,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/v1/events/"))
      return json(404, { error: "not_found" });
    if (request.method !== "POST")
      return json(405, { error: "method_not_allowed" });

    const token = /^Bearer (.+)$/.exec(
      request.headers.get("authorization") ?? "",
    )?.[1];
    const hash = token ? await sha256(token) : "";
    const producer = producers.find((p) => p.tokenSha256 === hash);
    if (!producer) return json(401, { error: "unauthenticated" });

    const subject = decodeURIComponent(path.slice("/v1/events/".length));
    let name;
    try {
      name = parseSubject(subject);
    } catch (e) {
      return json(400, { error: "bad_subject", detail: String(e) });
    }
    if (
      !producer.subjects.some((pattern) => subjectMatches(pattern, subject))
    ) {
      return json(403, {
        error: "subject_not_allowed",
        producer: producer.name,
        subject,
      });
    }

    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) return json(413, { error: "too_large" });
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });

    let event;
    try {
      event = fromBinary(
        { headers: Object.fromEntries(request.headers), body },
        "http",
      );
    } catch (e) {
      return json(400, { error: "bad_event", detail: String(e) });
    }
    let type;
    try {
      type = parseType(event.attributes["type"]!);
    } catch (e) {
      return json(422, { error: "bad_type", detail: String(e) });
    }
    if (
      type.product !== name.product ||
      type.entity !== name.entity ||
      type.verb !== name.verb
    ) {
      return json(422, {
        error: "type_does_not_match_subject",
        type: event.attributes["type"],
        subject,
      });
    }

    const wire = toBinary(event, "nats");
    try {
      const { duplicate } = await publisher.publish(subject, {
        id: event.attributes["id"]!,
        headers: wire.headers,
        body: wire.body,
      });
      return json(202, { id: event.attributes["id"], duplicate });
    } catch (e) {
      return json(503, { error: "publish_failed", detail: String(e) });
    }
  };
}
