// Test adapter for the proposed request data contract, not a runtime producer.
import { semanticErrors as manifestErrors } from "./superbench-checkpoint-validation";

export type WorkspaceRequest = {
  operation: string;
  key?: string;
  arguments?: string[];
  repositories?: Array<{
    name: string;
    repository: string;
    branch?: string;
    base?: string;
  }>;
  checkpoint_repository?: string;
  source?: { repository: string };
};

function repositoryIdentity(repository: string): boolean {
  const id = "0".repeat(32);
  return (
    manifestErrors({
      version: "superbench.checkpoint.v1",
      bench_id: id,
      generation_id: id,
      checkpoint_repository: "repo",
      members: [
        {
          name: "repo",
          repository,
          task_ref: "refs/heads/example",
          pin_ref: `refs/tags/superbench/pins/${id}/${id}/repo`,
          object_format: "sha1",
          commit: "0".repeat(40),
        },
      ],
    }).length === 0
  );
}

function shortBranch(branch: string): boolean {
  if (new TextEncoder().encode(branch).length > 255) return false;
  for (const character of branch) {
    const point = character.codePointAt(0) ?? 0;
    if (point <= 32 || point === 127) return false;
  }
  return (
    branch !== "@" &&
    branch !== "HEAD" &&
    !branch.startsWith("-") &&
    !branch.startsWith("refs/") &&
    !/[~^:?*[\\]/u.test(branch) &&
    !/\.\.|@\{|\/\/|(^|\/)\.|\.lock(\/|$)|[./]$/u.test(branch)
  );
}

export function workspaceErrors(body: WorkspaceRequest): string[] {
  const errors: string[] = [];
  if (!unicodeScalars(body)) errors.push("unicode_scalars");
  if (
    body.arguments?.some(
      (argument) => new TextEncoder().encode(argument).length > 8192,
    )
  )
    errors.push("argument_bytes");
  const members = body.repositories ?? [];
  const targets = new Set<string>();
  for (let index = 0; index < members.length; index++) {
    const member = members[index];
    if (!member) continue;
    const previous = members[index - 1];
    if (previous && previous.name >= member.name) errors.push("member_order");
    if (!repositoryIdentity(member.repository))
      errors.push("repository_identity");
    const target = JSON.stringify([
      member.repository,
      member.branch ?? `bench/${body.key ?? ""}`,
    ]);
    if (targets.has(target)) errors.push("duplicate_target");
    targets.add(target);
    for (const branch of [member.branch, member.base])
      if (branch !== undefined && !shortBranch(branch))
        errors.push("branch_name");
  }
  if (
    body.operation === "create" &&
    !members.some((member) => member.name === body.checkpoint_repository)
  )
    errors.push("coordinator");
  if (body.source) {
    if (!repositoryIdentity(body.source.repository))
      errors.push("repository_identity");
    if (
      !members.some((member) => member.repository === body.source?.repository)
    )
      errors.push("source_identity");
  }
  return errors;
}

function unicodeScalars(value: unknown): boolean {
  if (typeof value === "string") return !/[\uD800-\uDFFF]/u.test(value);
  if (Array.isArray(value)) return value.every(unicodeScalars);
  if (value !== null && typeof value === "object")
    return Object.values(value).every(unicodeScalars);
  return true;
}

// JSON.parse establishes syntax; the token walk adds duplicate-key rejection.
// Runtime implementations must enforce these boundaries independently.
export function strictDecode(raw: string): unknown {
  if (new TextEncoder().encode(raw).length > 64 << 10)
    throw new Error("request_size");
  const decoded: unknown = JSON.parse(raw);
  const tokens =
    raw.match(
      /"(?:\\.|[^"\\])*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}:,]|\[|\]/g,
    ) ?? [];
  let index = 0;
  const scan = () => {
    const token = tokens[index++];
    if (token === "{") {
      const seen = new Set<string>();
      while (tokens[index] !== "}") {
        const key: unknown = JSON.parse(tokens[index++] ?? "null");
        if (typeof key !== "string") throw new Error("json");
        if (seen.has(key)) throw new Error("duplicate_key");
        seen.add(key);
        index++;
        scan();
        if (tokens[index] !== ",") break;
        index++;
      }
      index++;
    } else if (token === "[") {
      while (tokens[index] !== "]") {
        scan();
        if (tokens[index] !== ",") break;
        index++;
      }
      index++;
    }
  };
  scan();
  return decoded;
}
