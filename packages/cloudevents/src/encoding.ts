/**
 * Header-value encoding for binary content mode, shared by the HTTP and NATS bindings.
 *
 * Senders percent-encode space, double quote, percent and every character outside U+0021-U+007E,
 * one `%XY` per UTF-8 byte, upper-case hex. Receivers run one round of percent-decoding, accept
 * unnecessary or lower-case encoding, and reject a sequence that is not valid UTF-8.
 */

const UTF8 = new TextEncoder();
const SAFE = /^[!#$&-~]$/; // printable ASCII less `"` and `%`

export function percentEncode(value: string): string {
  let out = "";
  for (const char of value) {
    if (SAFE.test(char)) {
      out += char;
      continue;
    }
    for (const byte of UTF8.encode(char)) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });

export function percentDecode(value: string): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < value.length) {
    if (value[i] === "%") {
      const hex = value.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
        throw new CloudEventError(
          `malformed percent-encoding in ${JSON.stringify(value)}`,
        );
      }
      bytes.push(parseInt(hex, 16));
      i += 3;
      continue;
    }
    const char = String.fromCodePoint(value.codePointAt(i)!);
    bytes.push(...UTF8.encode(char));
    i += char.length;
  }
  try {
    return STRICT_UTF8.decode(new Uint8Array(bytes));
  } catch {
    throw new CloudEventError(
      `not valid UTF-8 once decoded: ${JSON.stringify(value)}`,
    );
  }
}

/** HTTP only: a header value sent as a quoted-string is unquoted before it is percent-decoded. */
export function unquote(value: string): string {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) {
    return value;
  }
  return value.slice(1, -1).replace(/\\(.)/g, "$1");
}

export class CloudEventError extends Error {
  override name = "CloudEventError";
}
