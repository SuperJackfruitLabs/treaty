/**
 * An event as the outbox stores it. Structurally the same as `CloudEvent` from
 * `@superjackfruitlabs/treaty-cloudevents` (attributes as canonical strings, data as bytes), so
 * either can be passed where the other is expected, without this package depending on that one.
 */
export interface OutboxEvent {
  attributes: Record<string, string>;
  data?: Uint8Array;
}

/** A row the drain hands to `send`. */
export interface PendingEvent {
  event: OutboxEvent;
  /** The NATS subject (or other address) it goes to. */
  subject: string;
  attempts: number;
}

/** What `handleOnce` did. */
export type Delivery = "handled" | "duplicate";

/** Retry policy for the drain: when to try a failed event again. */
export interface Backoff {
  /** Milliseconds to wait after the `attempts`th failure. */
  delayMs(attempts: number): number;
  /** After this many attempts an event is parked as dead and not tried again. */
  maxAttempts: number;
}

export const DEFAULT_BACKOFF: Backoff = {
  delayMs: (attempts) =>
    Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 3_600_000),
  maxAttempts: 12,
};

export function encodeEvent(event: OutboxEvent): {
  attributes: string;
  data: Uint8Array | null;
} {
  if (!event.attributes["id"] || !event.attributes["source"]) {
    throw new Error("an outbox event needs its id and source attributes");
  }
  return {
    attributes: JSON.stringify(event.attributes),
    data: event.data ?? null,
  };
}

export function decodeEvent(
  attributes: string,
  data: Uint8Array | ArrayBuffer | null,
): OutboxEvent {
  const parsed = JSON.parse(attributes) as Record<string, string>;
  if (data === null || data.byteLength === 0) return { attributes: parsed };
  return {
    attributes: parsed,
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
  };
}
