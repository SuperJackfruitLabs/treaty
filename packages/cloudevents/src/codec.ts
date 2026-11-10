/**
 * CloudEvents 1.0 in binary content mode, over HTTP headers and NATS headers.
 *
 * An event is its context attributes as canonical strings plus the data as bytes, so the same
 * shape crosses every binding and every language. Typed values (a time, an integer) are the
 * producer's business: it writes their canonical string form.
 */
import { REQUIRED_ATTRIBUTES, SPEC_VERSION } from "./constants.ts";
import {
  CloudEventError,
  percentDecode,
  percentEncode,
  unquote,
} from "./encoding.ts";

export interface CloudEvent {
  /** Context attributes, including extensions, by name. Values are canonical strings. */
  attributes: Record<string, string>;
  data?: Uint8Array;
}

export type Binding = "http" | "nats";

export interface BinaryMessage {
  headers: Record<string, string>;
  body: Uint8Array;
}

const PREFIX = "ce-";
const NAME = /^[a-z0-9]{1,20}$/;

/** Throws unless the attributes are a valid CloudEvents 1.0 context. */
export function validate(attributes: Record<string, string>): void {
  for (const name of REQUIRED_ATTRIBUTES) {
    if (!attributes[name]) {
      throw new CloudEventError(`missing required attribute ${name}`);
    }
  }
  if (attributes["specversion"] !== SPEC_VERSION) {
    throw new CloudEventError(
      `unsupported specversion ${attributes["specversion"]}`,
    );
  }
  for (const name of Object.keys(attributes)) {
    if (!NAME.test(name)) {
      throw new CloudEventError(
        `attribute name ${JSON.stringify(name)} is not 1-20 of a-z0-9`,
      );
    }
  }
}

export function toBinary(event: CloudEvent, binding: Binding): BinaryMessage {
  validate(event.attributes);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(event.attributes)) {
    if (binding === "http" && name === "datacontenttype") {
      headers["content-type"] = value;
    } else {
      headers[PREFIX + name] = percentEncode(value);
    }
  }
  return { headers, body: event.data ?? new Uint8Array() };
}

export function fromBinary(
  message: BinaryMessage,
  binding: Binding,
): CloudEvent {
  const attributes: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(message.headers)) {
    const name = rawName.toLowerCase();
    if (name === "content-type") {
      if (/^application\/cloudevents/i.test(rawValue)) {
        throw new CloudEventError(
          "structured and batched content modes are not supported",
        );
      }
      if (binding === "http") attributes["datacontenttype"] = rawValue;
      continue;
    }
    if (!name.startsWith(PREFIX)) continue;
    const attribute = name.slice(PREFIX.length);
    if (binding === "http" && attribute === "datacontenttype") {
      throw new CloudEventError(
        "HTTP carries datacontenttype as Content-Type, never ce-datacontenttype",
      );
    }
    if (attribute in attributes) {
      throw new CloudEventError(`attribute ${attribute} appears twice`);
    }
    attributes[attribute] = percentDecode(
      binding === "http" ? unquote(rawValue) : rawValue,
    );
  }
  validate(attributes);
  return message.body.length > 0
    ? { attributes, data: message.body }
    : { attributes };
}
