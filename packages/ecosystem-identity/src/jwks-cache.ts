/**
 * A JWKS cache for verifyAccessToken. Stale while revalidate: an old set is served at once and
 * refreshed behind it. A kid the cached set does not hold triggers at most one refetch per
 * `refetchUnknownKidAfterMs` (30 s). Every fetch gives up after `timeoutMs` (3 s), and a failed
 * fetch keeps the last good set; only a cache that never had one throws.
 */

export interface JwksCacheOptions {
  url: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  refetchUnknownKidAfterMs?: number;
  /** How old a set may be before it is refreshed in the background. */
  maxAgeMs?: number;
  /** Milliseconds; defaults to Date.now. */
  now?: () => number;
}

export interface JwksCache {
  /** A JWKS for verifyAccessToken's `jwks`, refetched first when it lacks `kid`. */
  getKeys(kid: string | undefined): Promise<{ keys: unknown[] }>;
}

const hasKid = (set: { keys: unknown[] }, kid: string | undefined) =>
  set.keys.some(
    (k) => typeof k === "object" && k !== null && "kid" in k && k.kid === kid,
  );

export function createJwksCache(o: JwksCacheOptions): JwksCache {
  const doFetch = o.fetch ?? fetch;
  const now = o.now ?? Date.now;
  const timeoutMs = o.timeoutMs ?? 3000;
  const cooldown = o.refetchUnknownKidAfterMs ?? 30_000;
  const maxAge = o.maxAgeMs ?? 600_000;
  let good: { set: { keys: unknown[] }; at: number } | undefined;
  let inFlight: Promise<void> | undefined;
  let lastUnknownKid = -Infinity;

  async function load(): Promise<void> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    let body: unknown;
    try {
      const r = await doFetch(o.url, {
        headers: { accept: "application/json" },
        signal: abort.signal,
      });
      if (!r.ok) throw new Error(`JWKS ${o.url} answered ${r.status}`);
      body = await r.json();
    } finally {
      clearTimeout(timer);
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("keys" in body) ||
      !Array.isArray(body.keys)
    )
      throw new Error(`JWKS ${o.url} is not a key set`);
    good = { set: { keys: body.keys }, at: now() };
  }

  /** One fetch at a time. A failure is thrown only when there is no set to fall back on. */
  function refresh(): Promise<void> {
    inFlight ??= load()
      .catch((e: unknown) => {
        if (!good) throw e;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  return {
    async getKeys(kid) {
      if (!good) await refresh();
      else if (now() - good.at > maxAge) void refresh().catch(() => undefined);
      if (
        good &&
        !hasKid(good.set, kid) &&
        now() - lastUnknownKid >= cooldown
      ) {
        lastUnknownKid = now();
        await refresh();
      }
      if (!good) throw new Error(`JWKS ${o.url} could not be loaded`);
      return good.set;
    },
  };
}
