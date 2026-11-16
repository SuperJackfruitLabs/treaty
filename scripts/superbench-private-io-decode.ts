// Proposed private-crossing test codec only; not runtime authority or transport.
export function scalarStrings(value: unknown): boolean {
  if (typeof value === "string") return !/[\uD800-\uDFFF]/u.test(value);
  if (Array.isArray(value)) return value.every(scalarStrings);
  if (value !== null && typeof value === "object")
    return Object.entries(value).every(
      ([key, entry]) => scalarStrings(key) && scalarStrings(entry),
    );
  return true;
}

export function decodePrivate(
  raw: string | Uint8Array,
  maximum: number,
): unknown {
  if (typeof raw === "string" && !scalarStrings(raw))
    throw new Error("unicode_scalars");
  const bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
  if (![65536, 2097152, 16777216].includes(maximum) || bytes.length > maximum)
    throw new Error("private_size");
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    throw new Error("leading_bom");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const decoded: unknown = JSON.parse(text);
  if (!scalarStrings(decoded)) throw new Error("unicode_scalars");
  const tokens =
    text.match(
      /"(?:\\.|[^"\\])*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}:,]|\[|\]/g,
    ) ?? [];
  let index = 0;
  const scan = (depth: number) => {
    if (depth > 32) throw new Error("response_depth");
    const token = tokens[index++];
    if (token === "{") {
      const seen = new Set<string>();
      while (tokens[index] !== "}") {
        const key: unknown = JSON.parse(tokens[index++] ?? "null");
        if (typeof key !== "string") throw new Error("json");
        if (seen.has(key)) throw new Error("duplicate_key");
        seen.add(key);
        index++;
        scan(depth + 1);
        if (tokens[index] !== ",") break;
        index++;
      }
      index++;
    } else if (token === "[") {
      while (tokens[index] !== "]") {
        scan(depth + 1);
        if (tokens[index] !== ",") break;
        index++;
      }
      index++;
    } else if (token && /^-?\d/u.test(token)) {
      if (/^-|[.eE]/u.test(token)) throw new Error("integer_encoding");
      if (!Number.isSafeInteger(Number(token))) throw new Error("safe_integer");
    }
  };
  scan(0);
  return decoded;
}
