/**
 * URL shapes under schemas/urls/, read as data (`schemas/treaty/url-shape.v1.json`).
 *
 * A URL one product builds and another opens is a contract like a body: its origin, its path and
 * its query and fragment parameters. Read with the WHATWG URL parser, which Workers, Node and Bun
 * share.
 */
import { isCases } from "./cases.ts";
import { validatorFor, type Bundle, type Result } from "./schemas.ts";

export const URL_SHAPE_SCHEMA = "schemas/treaty/url-shape.v1.json";

export interface UrlParameter {
  name: string;
  required: boolean;
  /** JSON pointer, within the shape, to the decoded value's schema. */
  schema: string;
}

export interface UrlShape {
  /** Repository path of the shape. */
  path: string;
  origins: { scheme: string; hosts?: string[] }[];
  /** The exact `pathname`. */
  pathname: string;
  query: UrlParameter[];
  fragment: UrlParameter[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const escape = (token: string) =>
  token.replaceAll("~", "~0").replaceAll("/", "~1");

/** `accounts-matrix-link.v1` → `schemas/urls/accounts-matrix-link.v1.json`; a path stays as it is. */
export function urlShapePath(name: string): string {
  if (name.startsWith("schemas/")) return name;
  if (!/\.v[1-9][0-9]*$/.test(name))
    throw new Error(
      `name the shape's version too: ${JSON.stringify(name)} (e.g. "${name}.v1")`,
    );
  return `schemas/urls/${name}.json`;
}

function parameters(
  node: unknown,
  where: "query" | "fragment",
): UrlParameter[] {
  return Object.entries(isObject(node) ? node : {}).flatMap(([name, p]) =>
    isObject(p)
      ? [
          {
            name,
            required: p.required === true,
            schema: `/${where}/${escape(name)}/schema`,
          },
        ]
      : [],
  );
}

/** The shape a bundle holds, checked against its meta-schema. Throws when absent or invalid. */
export function urlShape(bundle: Bundle, name: string): UrlShape {
  const path = urlShapePath(name);
  const doc = bundle.files.get(path);
  if (!isObject(doc)) throw new Error(`${path} is not in the bundle`);
  const checked = validatorFor(bundle, URL_SHAPE_SCHEMA)(doc);
  if (!checked.valid)
    throw new Error(`${path} is not a URL shape: ${checked.errors[0]}`);
  const origins = (Array.isArray(doc.origins) ? doc.origins : []).flatMap(
    (o: unknown) =>
      isObject(o) && typeof o.scheme === "string"
        ? [
            {
              scheme: o.scheme,
              ...(Array.isArray(o.hosts)
                ? {
                    hosts: o.hosts.filter(
                      (h): h is string => typeof h === "string",
                    ),
                  }
                : {}),
            },
          ]
        : [],
  );
  return {
    path,
    origins,
    pathname: typeof doc.path === "string" ? doc.path : "",
    query: parameters(doc.query, "query"),
    fragment: parameters(doc.fragment, "fragment"),
  };
}

function checkParameters(
  bundle: Bundle,
  shape: UrlShape,
  where: "query" | "fragment",
  raw: string,
  errors: string[],
): void {
  const values = new URLSearchParams(raw);
  for (const p of where === "query" ? shape.query : shape.fragment) {
    const all = values.getAll(p.name);
    const label = `${where} parameter ${p.name}`;
    if (all.length === 0) {
      if (p.required) errors.push(`${label} is required`);
      continue;
    }
    if (all.length > 1) errors.push(`${label} appears ${all.length} times`);
    const r = validatorFor(bundle, `${shape.path}#${p.schema}`)(all[0]);
    for (const e of r.errors) errors.push(`${label}: ${e}`);
  }
}

/** Checks a URL against a shape: its origin, its path, and every parameter the shape names. */
export function validateUrl(
  bundle: Bundle,
  shape: UrlShape,
  url: string,
): Result {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, errors: ["not an absolute URL"] };
  }
  const errors: string[] = [];
  if (parsed.username !== "" || parsed.password !== "")
    errors.push("a URL with a user name or password is refused");
  const scheme = parsed.protocol.replace(/:$/, "");
  const origin = shape.origins.some(
    (o) =>
      o.scheme === scheme && (!o.hosts || o.hosts.includes(parsed.hostname)),
  );
  if (!origin)
    errors.push(
      `${scheme}://${parsed.hostname} is not an origin of ${shape.path}`,
    );
  if (parsed.pathname !== shape.pathname)
    errors.push(
      `path ${JSON.stringify(parsed.pathname)} is not ${JSON.stringify(shape.pathname)}`,
    );
  checkParameters(
    bundle,
    shape,
    "query",
    parsed.search.replace(/^\?/, ""),
    errors,
  );
  checkParameters(
    bundle,
    shape,
    "fragment",
    parsed.hash.replace(/^#/, ""),
    errors,
  );
  return { valid: errors.length === 0, errors };
}

/** The cases file beside a shape. */
export function urlCasesPath(path: string): string {
  return path
    .replace(/^schemas\//, "fixtures/")
    .replace(/\.json$/, ".cases.json");
}

/** Every rule a shape keeps beyond its meta-schema: its cases exist, hold both kinds, and answer as they say. */
export function checkUrlShape(bundle: Bundle, name: string): string[] {
  let shape: UrlShape;
  try {
    shape = urlShape(bundle, name);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const casesPath = urlCasesPath(shape.path);
  const cases = bundle.files.get(casesPath);
  if (!isCases(cases)) return [`${casesPath} holds no cases`];
  const problems: string[] = [];
  if (Object.keys(cases.valid).length === 0) problems.push("no valid case");
  if (cases.invalid.length === 0) problems.push("no invalid case");
  for (const [label, body] of Object.entries(cases.valid)) {
    const r =
      typeof body === "string"
        ? validateUrl(bundle, shape, body)
        : { valid: false, errors: ["a case is a URL string"] };
    if (!r.valid) problems.push(`refuses ${label}: ${r.errors.join("; ")}`);
  }
  for (const { why, body } of cases.invalid)
    if (typeof body !== "string")
      problems.push(`${why}: a case is a URL string`);
    else if (validateUrl(bundle, shape, body).valid)
      problems.push(`accepts ${why}`);
  return problems;
}
