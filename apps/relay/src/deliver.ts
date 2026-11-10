/**
 * Delivering events out: one JetStream message to one subscriber's Worker, as a signed HTTP
 * binary-mode CloudEvent.
 *
 * - 2xx: delivered, acknowledged.
 * - 408, 429, 5xx or a network failure: not delivered yet; redelivered after a backoff, up to
 *   the subscriber's maxDeliver.
 * - Any other 4xx, or a message that is not a valid event: retrying cannot help, so it is
 *   terminated and logged.
 */
import {
  SIGNATURE_HEADER,
  fromBinary,
  signDelivery,
  toBinary,
} from "../../../packages/cloudevents/src/index.ts";
import type { Subscriber } from "./config.ts";

export interface Delivered {
  subject: string;
  headers: Record<string, string>;
  data: Uint8Array;
  /** 1 on the first delivery. */
  deliveryCount: number;
  ack(): void;
  nak(delayMs: number): void;
  term(reason: string): void;
}

export type Outcome = "delivered" | "retry" | "dropped";

export const retryDelayMs = (deliveryCount: number) =>
  Math.min(1000 * 2 ** (deliveryCount - 1), 5 * 60_000);

export async function deliverOne(
  subscriber: Subscriber,
  message: Delivered,
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
  nowMs = Date.now(),
): Promise<Outcome> {
  let event;
  try {
    event = fromBinary(
      { headers: message.headers, body: message.data },
      "nats",
    );
  } catch (e) {
    message.term(`not a valid event: ${String(e)}`);
    return "dropped";
  }
  const wire = toBinary(event, "http");
  const id = event.attributes["id"]!;
  const headers = {
    ...wire.headers,
    [SIGNATURE_HEADER]: await signDelivery(
      subscriber.secret,
      id,
      wire.body,
      nowMs,
    ),
  };
  let status: number;
  try {
    status = (
      await send(subscriber.url, {
        method: "POST",
        headers,
        body: wire.body.slice(),
      })
    ).status;
  } catch {
    message.nak(retryDelayMs(message.deliveryCount));
    return "retry";
  }
  if (status >= 200 && status < 300) {
    message.ack();
    return "delivered";
  }
  if (status === 408 || status === 429 || status >= 500) {
    message.nak(retryDelayMs(message.deliveryCount));
    return "retry";
  }
  message.term(`${subscriber.name} answered ${status}`);
  return "dropped";
}
