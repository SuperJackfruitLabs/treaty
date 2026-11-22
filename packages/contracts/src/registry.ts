/**
 * The crossing registry (`contracts/registry.json`): every place one suite product talks to
 * another, whether or not treaty holds its contract.
 */

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
