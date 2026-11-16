// PROPOSED data-join conformance only. Inputs do not authenticate themselves.
import { decodeResponse } from "./superbench-workspace-response-decode";
export function decodeConsumer(raw: string | Uint8Array): unknown {
  const length =
    typeof raw === "string" ? new TextEncoder().encode(raw).length : raw.length;
  if (length > 65536) throw new Error("consumer_size");
  return decodeResponse(raw);
}
export type BenchRef = { key: string; bench_id: string };
export type CardBinding = {
  tenant: string;
  board: string;
  card: string;
  run?: string;
  bench: BenchRef;
  host_id: string;
  snapshot: string;
};
export type Locality = {
  bench: BenchRef;
  host_id: string;
  snapshot: string;
  observed_at_ms: number;
  expires_at_ms: number;
  state: "retained" | "unavailable";
  checkpoint_id?: string;
};
const sameBench = (a: BenchRef, b: BenchRef) =>
  a.key === b.key && a.bench_id === b.bench_id;
export function cardJoin(
  binding: CardBinding,
  current: CardBinding,
  observation: {
    snapshot: string;
    key: string;
    bench_id: string;
    host: { id: string };
  },
): boolean {
  return (
    binding.tenant === current.tenant &&
    binding.board === current.board &&
    binding.card === current.card &&
    binding.run === current.run &&
    sameBench(binding.bench, current.bench) &&
    binding.host_id === current.host_id &&
    binding.snapshot === current.snapshot &&
    observation.snapshot === binding.snapshot &&
    sameBench(binding.bench, observation) &&
    observation.host.id === binding.host_id
  );
}
export function localityMatches(
  observation: Locality,
  expected: {
    bench: BenchRef;
    host_id: string;
    checkpoint_id: string;
    snapshot: string;
    phase: string;
    availability: string;
    transfer_state?: string;
  },
  now: number,
): boolean {
  return (
    Number.isSafeInteger(now) &&
    now >= observation.observed_at_ms &&
    now < observation.expires_at_ms &&
    observation.expires_at_ms > observation.observed_at_ms &&
    observation.expires_at_ms - observation.observed_at_ms <= 300000 &&
    observation.state === "retained" &&
    expected.phase === "ready" &&
    expected.availability !== "blocked" &&
    expected.transfer_state === undefined &&
    sameBench(observation.bench, expected.bench) &&
    observation.host_id === expected.host_id &&
    observation.snapshot === expected.snapshot &&
    observation.checkpoint_id === expected.checkpoint_id
  );
}
