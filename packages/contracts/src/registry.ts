/**
 * The crossing registry (`contracts/registry.json`): every place one suite product talks to
 * another, whether or not treaty holds its contract.
 */
import { validatorFor, type Bundle } from "./schemas.ts";

export const PRODUCTS = [
  "accounts",
  "agentpod",
  "salaam",
  "superbench",
  "superdispatch",
  "superexchange",
  "superlibrary",
  "supermessage",
  "superpipeline",
  "supertoolkit",
  "superwitness",
  "treaty",
] as const;
export type Product = (typeof PRODUCTS)[number];

export type CrossingKind =
  | "http"
  | "event"
  | "matrix"
  | "ipc"
  | "cli"
  | "file"
  | "token"
  | "mcp"
  | "telemetry";

export type CrossingStatus =
  | "contracted"
  | "partial"
  | "uncontracted"
  | "proposed"
  | "external"
  | "standard"
  | "deprecated";

export interface Crossing {
  id: string;
  title: string;
  owner: Product;
  consumers: Product[];
  kind: CrossingKind;
  status: CrossingStatus;
  /** Repository paths under schemas/, fixtures/ or contracts/. */
  contract: string[];
  /** Schema path → "<fixture path>#<JSON pointer>" of its valid and invalid cases. */
  cases?: Record<string, string>;
  standard?: string;
  gaps?: string;
  phase?: number;
  evidence: string[];
}

export interface Registry {
  registry: "treaty crossings";
  version: 1;
  description?: string;
  crossings: Crossing[];
}

export interface Coverage {
  /** Crossings a contract can apply to: every one but standard and deprecated. */
  applicable: number;
  byStatus: Record<CrossingStatus, number>;
  /** round(100 × contracted ÷ applicable). */
  percent: number;
}

export function coverage(registry: Registry): Coverage {
  const byStatus: Record<CrossingStatus, number> = {
    contracted: 0,
    partial: 0,
    uncontracted: 0,
    proposed: 0,
    external: 0,
    standard: 0,
    deprecated: 0,
  };
  for (const crossing of registry.crossings) byStatus[crossing.status] += 1;
  const applicable =
    registry.crossings.length - byStatus.standard - byStatus.deprecated;
  const percent =
    applicable === 0
      ? 100
      : Math.round((100 * byStatus.contracted) / applicable);
  return { applicable, byStatus, percent };
}

export function findCrossing(
  registry: Registry,
  id: string,
): Crossing | undefined {
  return registry.crossings.find((c) => c.id === id);
}

/**
 * The registry in a bundle, checked against `schemas/treaty/registry.v1.json`. Throws with the
 * first problem when it does not hold.
 */
export function readRegistry(bundle: Bundle): Registry {
  const value = bundle.files.get("contracts/registry.json");
  const result = validatorFor(bundle, "schemas/treaty/registry.v1.json")(value);
  if (!result.valid || !isRegistryShape(value))
    throw new Error(
      `contracts/registry.json is invalid: ${result.errors[0] ?? "not a registry"}`,
    );
  return value;
}

function isRegistryShape(value: unknown): value is Registry {
  return (
    value !== null &&
    typeof value === "object" &&
    "crossings" in value &&
    Array.isArray(value.crossings)
  );
}
