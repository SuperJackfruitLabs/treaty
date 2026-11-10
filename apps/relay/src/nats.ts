/**
 * The relay's NATS side: the two streams, publishing with Nats-Msg-Id, and one durable pull
 * consumer per subscriber.
 *
 * Two streams so a slow audit consumer never holds up work and a purge of work events never
 * touches audit (treaty plan, Naming): WORK holds `evt.>`, AUDIT holds `audit.>`.
 */
import {
  AckPolicy,
  DeliverPolicy,
  jetstream,
  jetstreamManager,
  type JetStreamManager,
} from "@nats-io/jetstream";
import {
  connect,
  headers as natsHeaders,
  nanos,
  type NatsConnection,
} from "@nats-io/transport-node";
import type { RelayConfig, Subscriber } from "./config.ts";
import { deliverOne, type Outcome } from "./deliver.ts";
import type { Publisher } from "./ingest.ts";

export const WORK_STREAM = "WORK";
export const AUDIT_STREAM = "AUDIT";

export async function open(natsUrl: string): Promise<NatsConnection> {
  return connect({ servers: natsUrl, name: "treaty-relay" });
}

async function upsertStream(
  jsm: JetStreamManager,
  config: {
    name: string;
    subjects: string[];
    max_age: number;
    duplicate_window?: number;
  },
) {
  try {
    await jsm.streams.info(config.name);
    await jsm.streams.update(config.name, config);
  } catch {
    await jsm.streams.add(config);
  }
}

export async function ensureStreams(
  nc: NatsConnection,
  config: Pick<RelayConfig, "work" | "audit">,
): Promise<void> {
  const jsm = await jetstreamManager(nc);
  await upsertStream(jsm, {
    name: WORK_STREAM,
    subjects: ["evt.>"],
    max_age: nanos(config.work.maxAgeMs),
    duplicate_window: nanos(config.work.duplicateWindowMs),
  });
  await upsertStream(jsm, {
    name: AUDIT_STREAM,
    subjects: ["audit.>"],
    max_age: nanos(config.audit.maxAgeMs),
  });
}

export function publisher(nc: NatsConnection): Publisher {
  const js = jetstream(nc);
  return {
    async publish(subject, message) {
      const h = natsHeaders();
      for (const [k, v] of Object.entries(message.headers)) h.set(k, v);
      const ack = await js.publish(subject, message.body, {
        msgID: message.id,
        headers: h,
      });
      return { duplicate: ack.duplicate };
    },
  };
}

/** Starts delivering to each subscriber. Resolves once every consumer is listening; returns a stop function. */
export async function startDelivery(
  nc: NatsConnection,
  subscribers: Subscriber[],
  options: {
    send?: (url: string, init: RequestInit) => Promise<Response>;
    onOutcome?: (s: Subscriber, outcome: Outcome) => void;
  } = {},
): Promise<() => Promise<void>> {
  const jsm = await jetstreamManager(nc);
  const js = jetstream(nc);
  const stops: Array<() => Promise<void>> = [];
  for (const subscriber of subscribers) {
    const durable = `relay-${subscriber.name}`;
    const consumer = {
      durable_name: durable,
      filter_subject: subscriber.filter,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      ack_wait: nanos(30_000),
      max_deliver: subscriber.maxDeliver,
    };
    try {
      await jsm.consumers.info(WORK_STREAM, durable);
      await jsm.consumers.update(WORK_STREAM, durable, consumer);
    } catch {
      await jsm.consumers.add(WORK_STREAM, consumer);
    }
    const messages = await (
      await js.consumers.get(WORK_STREAM, durable)
    ).consume();
    const loop = (async () => {
      for await (const m of messages) {
        const headers: Record<string, string> = {};
        for (const key of m.headers?.keys() ?? [])
          headers[key] = m.headers!.get(key);
        const outcome = await deliverOne(
          subscriber,
          {
            subject: m.subject,
            headers,
            data: m.data,
            deliveryCount: m.info.deliveryCount,
            ack: () => m.ack(),
            nak: (ms) => m.nak(ms),
            term: (reason) => {
              console.error(
                `relay: dropped ${m.subject} seq ${m.seq} for ${subscriber.name}: ${reason}`,
              );
              m.term(reason);
            },
          },
          options.send,
        );
        options.onOutcome?.(subscriber, outcome);
      }
    })();
    stops.push(async () => {
      await messages.close();
      await loop;
    });
  }
  return async () => {
    await Promise.all(stops.map((stop) => stop()));
  };
}
