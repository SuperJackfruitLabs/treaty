/**
 * The relay's configuration, from the environment.
 *
 * - TREATY_RELAY_PRODUCERS: JSON list of { name, tokenSha256, subjects }. A producer sends a
 *   bearer token; the relay stores only its SHA-256, and lets it publish only to subjects that
 *   match one of its patterns (NATS wildcards, e.g. `evt.*.superpipeline.>`).
 * - TREATY_RELAY_SUBSCRIBERS: JSON list of { name, url, secret, filter, maxDeliver? }. Each gets a
 *   durable JetStream consumer on `filter`, and every event is POSTed to `url`, signed with
 *   `secret`.
 * - NATS_URL, PORT, and the streams' retention (TREATY_RELAY_WORK_MAX_AGE_HOURS,
 *   TREATY_RELAY_AUDIT_MAX_AGE_DAYS, TREATY_RELAY_DUPLICATE_WINDOW_MINUTES). Retention is not
 *   decided yet (treaty plan, Not decided here), so the defaults are placeholders.
 */
export interface Producer {
  name: string;
  tokenSha256: string;
  subjects: string[];
}

export interface Subscriber {
  name: string;
  url: string;
  secret: string;
  filter: string;
  maxDeliver: number;
}

export interface RelayConfig {
  natsUrl: string;
  port: number;
  producers: Producer[];
  subscribers: Subscriber[];
  work: { maxAgeMs: number; duplicateWindowMs: number };
  audit: { maxAgeMs: number };
}

const HOUR = 3_600_000;

function list<T>(
  raw: string | undefined,
  name: string,
  check: (item: Record<string, unknown>) => T,
): T[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON list`);
  return parsed.map((item, i) => {
    if (typeof item !== "object" || item === null)
      throw new Error(`${name}[${i}] must be an object`);
    return check(item as Record<string, unknown>);
  });
}

function text(
  item: Record<string, unknown>,
  key: string,
  where: string,
): string {
  const value = item[key];
  if (typeof value !== "string" || value === "")
    throw new Error(`${where}.${key} must be a non-empty string`);
  return value;
}

/** https anywhere; plain http only where it never crosses a network the relay does not own. */
export function allowedUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    /^[a-z0-9-]+$/i.test(url.hostname)
  );
}

function positive(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${name} must be a positive number`);
  return n;
}

export function loadConfig(
  env: Record<string, string | undefined>,
): RelayConfig {
  const producers = list(
    env["TREATY_RELAY_PRODUCERS"],
    "TREATY_RELAY_PRODUCERS",
    (p) => {
      const name = text(p, "name", "producer");
      const tokenSha256 = text(p, "tokenSha256", name).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(tokenSha256))
        throw new Error(`${name}.tokenSha256 must be 64 hex characters`);
      const subjects = p["subjects"];
      if (
        !Array.isArray(subjects) ||
        subjects.length === 0 ||
        !subjects.every((s) => typeof s === "string" && s)
      ) {
        throw new Error(
          `${name}.subjects must be a non-empty list of subject patterns`,
        );
      }
      return { name, tokenSha256, subjects: subjects as string[] };
    },
  );
  const subscribers = list(
    env["TREATY_RELAY_SUBSCRIBERS"],
    "TREATY_RELAY_SUBSCRIBERS",
    (s) => {
      const name = text(s, "name", "subscriber");
      if (!/^[A-Za-z0-9_-]+$/.test(name))
        throw new Error(
          `subscriber name ${JSON.stringify(name)} must be letters, digits, _ or -`,
        );
      const url = text(s, "url", name);
      if (!allowedUrl(url)) {
        throw new Error(
          `${name}.url must be https (plain http only for localhost or a single-label host on the relay's own network)`,
        );
      }
      const maxDeliver =
        s["maxDeliver"] === undefined ? 10 : Number(s["maxDeliver"]);
      if (!Number.isInteger(maxDeliver) || maxDeliver < 1)
        throw new Error(`${name}.maxDeliver must be a positive integer`);
      return {
        name,
        url,
        secret: text(s, "secret", name),
        filter: text(s, "filter", name),
        maxDeliver,
      };
    },
  );
  return {
    natsUrl: env["NATS_URL"] || "nats://127.0.0.1:4222",
    port: positive(env["PORT"], 8080, "PORT"),
    producers,
    subscribers,
    work: {
      maxAgeMs:
        positive(
          env["TREATY_RELAY_WORK_MAX_AGE_HOURS"],
          24 * 7,
          "TREATY_RELAY_WORK_MAX_AGE_HOURS",
        ) * HOUR,
      duplicateWindowMs:
        positive(
          env["TREATY_RELAY_DUPLICATE_WINDOW_MINUTES"],
          60,
          "TREATY_RELAY_DUPLICATE_WINDOW_MINUTES",
        ) * 60_000,
    },
    audit: {
      maxAgeMs:
        positive(
          env["TREATY_RELAY_AUDIT_MAX_AGE_DAYS"],
          365,
          "TREATY_RELAY_AUDIT_MAX_AGE_DAYS",
        ) *
        24 *
        HOUR,
    },
  };
}
