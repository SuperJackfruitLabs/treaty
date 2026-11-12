export type Finding = {
  code: string;
  filename: string;
  message: string;
  labels?: Array<{ span?: { line?: number } }>;
};
export const SRC_CLEAN: Set<string>;
export function isSource(file: string): boolean;
export function judge(
  findings: Finding[],
  baseline: Record<string, number>,
  options?: { lock?: boolean },
): { out: string[]; code: number; next?: Record<string, number> };
