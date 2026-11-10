/**
 * The relay: Workers send CloudEvents to it over HTTPS, it publishes them to JetStream, and it
 * delivers them to subscribing Workers over signed HTTP (treaty plan step 6).
 */
import { loadConfig } from "./config.ts";
import { ingest } from "./ingest.ts";
import { ensureStreams, open, publisher, startDelivery } from "./nats.ts";

const config = loadConfig(process.env);
const nc = await open(config.natsUrl);
await ensureStreams(nc, config);
const stopDelivery = await startDelivery(nc, config.subscribers);
const handle = ingest(config.producers, publisher(nc));

const server = Bun.serve({
  port: config.port,
  fetch(request) {
    if (new URL(request.url).pathname === "/healthz") {
      return Response.json({
        ok: !nc.isClosed(),
        producers: config.producers.length,
        subscribers: config.subscribers.length,
      });
    }
    return handle(request);
  },
});
console.log(`relay: listening on :${server.port}, NATS ${config.natsUrl}`);

async function shutdown() {
  await server.stop();
  await stopDelivery();
  await nc.drain();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
