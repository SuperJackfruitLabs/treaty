/**
 * Reading a consumer's go.mod for the treaty module it requires. A Go product that depends on
 * `github.com/SuperJackfruitLabs/treaty` at the release its treaty.json pins needs no vendored
 * copies: the module carries the release's files, and the Go checksum database pins their bytes.
 */

/** The treaty Go module's path. */
export const GO_MODULE = "github.com/SuperJackfruitLabs/treaty";

export interface GoModRequirement {
  /** The version required (`v0.0.23`), or undefined when go.mod does not require the module. */
  version?: string;
  /** What a `replace` directive points the module at instead, when one does. */
  replacedBy?: string;
}

/** A line with its `//` comment removed, trimmed. go.mod has no other comment form. */
function uncommented(line: string): string {
  const at = line.indexOf("//");
  return (at === -1 ? line : line.slice(0, at)).trim();
}

/** A module path or version as go.mod writes it, quoted or not. */
function unquote(word: string): string {
  return /^".*"$|^`.*`$/.test(word) ? word.slice(1, -1) : word;
}

/** The treaty module's requirement and any replacement in a go.mod's text. */
export function goModRequirement(text: string): GoModRequirement {
  const out: GoModRequirement = {};
  const replaces: { version?: string; target: string }[] = [];
  let block: string | undefined;
  for (const raw of text.split("\n")) {
    const line = uncommented(raw);
    if (line === "") continue;
    if (block !== undefined && line === ")") {
      block = undefined;
      continue;
    }
    let verb: string | undefined;
    let rest: string;
    if (block !== undefined) {
      verb = block;
      rest = line;
    } else {
      const m = /^(\w+)\s*(.*)$/.exec(line);
      if (!m) continue;
      verb = m[1];
      rest = m[2] ?? "";
      if (rest === "(") {
        block = verb;
        continue;
      }
    }
    const words = rest.split(/\s+/).map(unquote);
    if (words[0] !== GO_MODULE) continue;
    const version = words[1];
    if (verb === "require" && version) out.version = version;
    else if (verb === "replace") {
      // `replace M => X` replaces every version; `replace M v => X` only v.
      const arrow = words.indexOf("=>");
      if (arrow === 1 || arrow === 2)
        replaces.push({
          ...(arrow === 2 && version ? { version } : {}),
          target: words.slice(arrow + 1).join(" "),
        });
    }
  }
  const replaced = replaces.find(
    (r) => r.version === undefined || r.version === out.version,
  );
  if (replaced) out.replacedBy = replaced.target;
  return out;
}
