/**
 * The suite's names for events (treaty plan, Naming).
 *
 * Subjects: `evt.<workspace>.<product>.<entity>.<verb>`. Tenancy and filtering work on prefixes.
 * Types: `com.superjackfruit.<product>.<entity>.<verb>.v<N>`. A version lives in the type, never
 * in the subject, so a consumer can filter across versions.
 */
import { CloudEventError } from "./encoding.ts";

export interface EventName {
  product: string;
  entity: string;
  verb: string;
}

const WORD = /^[a-z][a-z0-9_]*$/;
const WORKSPACE = /^[A-Za-z0-9_-]+$/;

function check(name: EventName): void {
  for (const [part, value] of Object.entries(name)) {
    if (!WORD.test(value)) {
      throw new CloudEventError(
        `${part} ${JSON.stringify(value)} must match ${WORD}`,
      );
    }
  }
}

export function eventSubject(workspace: string, name: EventName): string {
  if (!WORKSPACE.test(workspace)) {
    throw new CloudEventError(
      `workspace ${JSON.stringify(workspace)} must match ${WORKSPACE}`,
    );
  }
  check(name);
  return `evt.${workspace}.${name.product}.${name.entity}.${name.verb}`;
}

export function eventType(name: EventName, version: number): string {
  check(name);
  if (!Number.isInteger(version) || version < 1) {
    throw new CloudEventError(`version ${version} must be a positive integer`);
  }
  return `com.superjackfruit.${name.product}.${name.entity}.${name.verb}.v${version}`;
}

export function parseSubject(
  subject: string,
): { workspace: string } & EventName {
  const [evt, workspace, product, entity, verb, ...rest] = subject.split(".");
  if (
    evt !== "evt" ||
    !workspace ||
    !product ||
    !entity ||
    !verb ||
    rest.length
  ) {
    throw new CloudEventError(
      `not an event subject: ${JSON.stringify(subject)}`,
    );
  }
  const name = { product, entity, verb };
  eventSubject(workspace, name);
  return { workspace, ...name };
}

export function parseType(type: string): EventName & { version: number } {
  const match =
    /^com\.superjackfruit\.([^.]+)\.([^.]+)\.([^.]+)\.v([1-9][0-9]*)$/.exec(
      type,
    );
  if (!match) {
    throw new CloudEventError(
      `not a suite event type: ${JSON.stringify(type)}`,
    );
  }
  const name = { product: match[1]!, entity: match[2]!, verb: match[3]! };
  check(name);
  return { ...name, version: Number(match[4]) };
}
