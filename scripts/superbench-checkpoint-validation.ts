// Contract semantic checks for the plain-data corpus. This is a test adapter,
// not a producer implementation or an authorization decision.
export type Member = {
  name: string;
  repository: string;
  task_ref: string;
  pin_ref: string;
  object_format: "sha1" | "sha256";
  commit: string;
};

export type Manifest = {
  version: "superbench.checkpoint.v1";
  bench_id: string;
  generation_id: string;
  checkpoint_repository: string;
  previous_manifest_commit?: string;
  members: Member[];
};

function repositoryIdentity(raw: string): boolean {
  if (new TextEncoder().encode(raw).length > 4096) return false;
  if (raw.startsWith("/")) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!["http:", "https:", "ssh:", "file:"].includes(url.protocol))
        return false;
      // URL.search/hash erase empty selectors, so inspect the raw bytes too.
      if (raw.includes("?") || raw.includes("#")) return false;
      const authority = raw.slice(raw.indexOf("://") + 3).split("/")[0] ?? "";
      const userinfo = authority.includes("@")
        ? authority.slice(0, authority.lastIndexOf("@"))
        : "";
      if (url.protocol === "file:")
        return (
          !authority.includes("@") &&
          (url.hostname === "" || url.hostname === "localhost") &&
          url.pathname.startsWith("/")
        );
      if (!url.hostname) return false;
      if (url.protocol === "ssh:")
        return (
          (!authority.includes("@") || url.username !== "") &&
          !userinfo.includes(":") &&
          !url.password
        );
      return !authority.includes("@");
    } catch {
      return false;
    }
  }
  // SCP-style identities require an explicit SSH user, host, and nonempty path.
  // A colon before '@' is a password-like authority, not an SSH username.
  const at = raw.indexOf("@");
  if (at >= 0 && raw.indexOf(":") < at) return false;
  // The path is opaque Git path text, so URI selectors and colons are literal.
  const scp =
    /^[A-Za-z0-9_.-]+@(\[[^\]\s]+\]|[A-Za-z0-9][A-Za-z0-9.-]*):.+$/.exec(raw);
  if (!scp) return false;
  const host = scp[1];
  if (host?.startsWith("[")) {
    try {
      return new URL(`ssh://${host}/`).hostname !== "";
    } catch {
      return false;
    }
  }
  return true;
}

function unicodeScalars(value: unknown): boolean {
  if (typeof value === "string") {
    // Unicode-mode matching sees valid surrogate pairs as one astral scalar;
    // only unpaired UTF-16 code units remain in this range.
    return !/[\uD800-\uDFFF]/u.test(value);
  }
  if (Array.isArray(value)) return value.every(unicodeScalars);
  if (value !== null && typeof value === "object")
    return Object.values(value).every(unicodeScalars);
  return true;
}

// Call only after successful structural schema validation.
export function semanticErrors(body: Manifest): string[] {
  const errors: string[] = [];
  if (!unicodeScalars(body)) errors.push("unicode_scalars");
  const names = body.members.map((member) => member.name);
  if (
    names.some((name, index) => {
      const previous = names[index - 1];
      return previous !== undefined && name <= previous;
    })
  )
    errors.push("member_order");
  const coordinator = body.members.find(
    (member) => member.name === body.checkpoint_repository,
  );
  if (!coordinator) errors.push("coordinator");
  const targets = new Set<string>();
  for (const member of body.members) {
    if (
      member.pin_ref !==
      `refs/tags/superbench/pins/${body.bench_id}/${body.generation_id}/${member.name}`
    )
      errors.push("pin_scope");
    const target = JSON.stringify([member.repository, member.task_ref]);
    if (targets.has(target)) errors.push("duplicate_target");
    targets.add(target);
    if (!repositoryIdentity(member.repository))
      errors.push("repository_identity");
  }
  if (
    coordinator &&
    body.previous_manifest_commit !== undefined &&
    body.previous_manifest_commit.length !==
      (coordinator.object_format === "sha1" ? 40 : 64)
  )
    errors.push("previous_format");
  return errors;
}
