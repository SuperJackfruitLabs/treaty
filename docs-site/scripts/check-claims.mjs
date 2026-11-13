// The docs claim what treaty holds. Runs after scripts/generate.mjs and before every build
// (`npm run build`), so a page that names a type, a setting, a status code or an export the code
// does not have fails the build, and so does a schema with no page.
//
// It reads treaty itself, one directory up from docs-site/:
//   schemas/catalog.json, schemas/superpipeline/, schemas/matrix/   every type and schema
//   fixtures/superpipeline-events/, fixtures/matrix-events/          every schema's cases
//   apps/relay/src/                      the relay's settings, defaults, status codes and retries
//   packages/*/package.json, packages/*/src/                  every package and what it exports
//   CHANGELOG.md                                              the current version
// and src/data/parties.json (who sends and reads each schema). No dependencies: Node alone.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaKeys, slugOf } from './generate.mjs';

const site = resolve(fileURLToPath(import.meta.url), '../..');
const repo = resolve(site, '..');
const docsDir = join(site, 'src/content/docs');
const read = (p) => readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));

const problems = [];
const fail = (msg) => problems.push(msg);

// ---- the pages --------------------------------------------------------------------------------

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.mdx?$/.test(name) ? [p] : [];
  });
}
const pages = new Map(walk(docsDir).map((p) => [relative(docsDir, p).replace(/\\/g, '/'), read(p)]));
/** A page's slug, as Starlight routes it: `events/index.md` -> `events`, `index.mdx` -> ``. */
const slugOfFile = (file) => file.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
const bySlug = new Map([...pages].map(([f, t]) => [slugOfFile(f), t]));
const page = (name) => {
  const text = pages.get(name);
  if (text === undefined) throw new Error(`check-claims: no page ${name}`);
  return text;
};
const handWritten = new Map([...pages].filter(([f]) => !/^(events|matrix)\//.test(f)));
const has = (text, s) => text.includes('`' + s + '`');

for (const [name, text] of pages) {
  const front = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  if (!/^title: \S/m.test(front)) fail(`${name}: no title`);
  if (!/^description: \S/m.test(front)) fail(`${name}: no description`);
}

// ---- every schema has a page, every page a schema ----------------------------------------------

const catalog = readJson(join(repo, 'schemas/catalog.json'));
const parties = readJson(join(site, 'src/data/parties.json'));
const keys = schemaKeys();
const schemas = new Map(keys.map((k) => [k, readJson(join(repo, 'schemas', k + '.json'))]));
const matrixTypes = new Set(keys.filter((k) => k.startsWith('matrix/')).map((k) => k.slice('matrix/'.length)));
const catalogTypes = new Set(catalog.events.map((e) => e.type));

const expected = new Set(['events', 'matrix', ...keys.map(slugOf)]);
for (const s of expected) if (!bySlug.has(s)) fail(`no page for ${s} (run scripts/generate.mjs)`);
for (const s of bySlug.keys()) if (/^(events|matrix)(\/|$)/.test(s) && !expected.has(s)) fail(`the page ${s} names no schema treaty holds`);

for (const k of keys) {
  if (!parties.schemas[k]) fail(`src/data/parties.json has no entry for ${k}`);
  const schema = schemas.get(k);
  const expectId = `https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/schemas/${k}.json`;
  if (schema.$id !== expectId) fail(`${k}: $id is ${schema.$id}, not ${expectId}`);
}
for (const k of Object.keys(parties.schemas)) if (!schemas.has(k)) fail(`src/data/parties.json names ${k}, which is not a schema`);

const products = new Set(Object.keys(parties.products));
for (const [k, p] of Object.entries(parties.schemas)) {
  for (const name of [...(p.producers ?? []), ...(p.consumers ?? []).map((c) => c.product), ...(p.sentBy ?? []), ...(p.readBy ?? [])]) {
    if (!products.has(name)) fail(`parties.json ${k}: ${name} is not a product it lists`);
  }
}

// Every catalogue entry points at a schema treaty holds, its producer is the one parties.json
// names, and its type is on that schema's page with its subject.
const byId = new Map([...schemas].map(([k, s]) => [s.$id, k]));
for (const e of catalog.events) {
  const k = byId.get(e.dataschema);
  if (!k) { fail(`catalog: ${e.type}'s dataschema ${e.dataschema} is no schema here`); continue; }
  const p = parties.schemas[k];
  if (!p?.producers?.some((x) => x.toLowerCase() === e.producer)) fail(`parties.json ${k}: the catalogue's producer of ${e.type} is ${e.producer}`);
  const text = bySlug.get(slugOf(k)) ?? '';
  if (!has(text, e.type)) fail(`${slugOf(k)} does not name ${e.type}`);
  if (!has(text, e.pushName)) fail(`${slugOf(k)} does not name the body event ${e.pushName}`);
  const [, product, entity, verb] = /^com\.superjackfruit\.([^.]+)\.([^.]+)\.([^.]+)\.v\d+$/.exec(e.type) ?? [];
  if (!product) fail(`catalog: ${e.type} is not a suite event type`);
  else if (!has(text, `evt.<workspace>.${product}.${entity}.${verb}`)) fail(`${slugOf(k)} does not give ${e.type}'s subject`);
  const schema = schemas.get(k);
  const named = schema.properties?.event?.const ?? schema.properties?.event?.enum;
  if (named && ![named].flat().includes(e.pushName)) fail(`${k}: the schema's event does not allow ${e.pushName}`);
}
for (const k of keys.filter((k) => k.startsWith('superpipeline/'))) {
  if (!catalog.events.some((e) => e.dataschema === schemas.get(k).$id)) fail(`${k} has no entry in schemas/catalog.json`);
}

// Every schema's cases are in its corpus, so every page has an example.
const spCases = readJson(join(repo, 'fixtures/superpipeline-events/examples.json')).schemas;
const mxCases = readJson(join(repo, 'fixtures/matrix-events/examples.json')).schemas;
for (const k of keys) {
  const [dir, name] = k.split('/');
  const cases = (dir === 'matrix' ? mxCases : spCases)[name];
  if (!cases || !Object.keys(cases.valid ?? {}).length) fail(`${k} has no valid case in its corpus`);
  if (!cases?.invalid?.length) fail(`${k} has no refused case in its corpus`);
}

// ---- every type a page names exists -----------------------------------------------------------

for (const [name, text] of pages) {
  for (const m of text.matchAll(/`(com\.superjackfruit\.[a-z0-9_.]+)`/g)) {
    if (!catalogTypes.has(m[1])) fail(`${name} names ${m[1]}, which is not in schemas/catalog.json`);
  }
  for (const m of text.matchAll(/`(dev\.(?:superpipeline|agentpod)\.[a-z0-9_.]+)`/g)) {
    if (!matrixTypes.has(m[1])) fail(`${name} names ${m[1]}, which has no schema in schemas/matrix/`);
  }
  for (const m of text.matchAll(/`(evt\.[^`]+)`/g)) {
    const parts = m[1].split('.');
    if (parts.length !== 5 && !m[1].endsWith('>')) fail(`${name}: ${m[1]} is not evt.<workspace>.<product>.<entity>.<verb>`);
  }
}

// ---- every internal link lands ----------------------------------------------------------------

const slugger = (h) =>
  h.toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
const anchorsOf = (text) => new Set([...text.matchAll(/^#{2,4} (.+)$/gm)].map((m) => slugger(m[1])));
for (const [name, text] of pages) {
  const links = [
    ...[...text.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]),
    ...[...text.matchAll(/(?:href="|link: )(\/[^"\s]*)/g)].map((m) => m[1]),
  ];
  for (const link of links) {
    const [path, anchor] = link.split('#');
    const slug = path.replace(/^\/|\/$/g, '');
    if (/\.(png|svg|txt|xml)$/.test(slug)) continue;
    const target = bySlug.get(slug);
    if (target === undefined) { fail(`${name} links to ${link}, which is no page`); continue; }
    if (anchor && !anchorsOf(target).has(anchor)) fail(`${name} links to ${link}: no such heading`);
  }
}

// ---- the relay --------------------------------------------------------------------------------

const relaySrc = join(repo, 'apps/relay/src');
const config = read(join(relaySrc, 'config.ts'));
const ingest = read(join(relaySrc, 'ingest.ts'));
const deliver = read(join(relaySrc, 'deliver.ts'));
const nats = read(join(relaySrc, 'nats.ts'));
const relay = page('relay.md');

const envNames = new Set([...config.matchAll(/env\["([A-Z_]+)"\]/g)].map((m) => m[1]));
if (envNames.size < 7) fail(`read only ${envNames.size} settings from the relay's config.ts`);
const settingRows = new Map(
  relay.split('\n').filter((l) => /^\| `[A-Z_]+` \|/.test(l)).map((l) => [l.match(/^\| `([A-Z_]+)`/)[1], l]),
);
for (const n of envNames) if (!settingRows.has(n)) fail(`relay.md does not list the setting ${n}`);
for (const n of settingRows.keys()) if (!envNames.has(n)) fail(`relay.md lists ${n}, which the relay does not read`);
const flat = config.replace(/\s+/g, ' ');
const defaults = {
  NATS_URL: flat.match(/env\["NATS_URL"\] \|\| "([^"]+)"/)?.[1],
  PORT: flat.match(/env\["PORT"\], (\d+)/)?.[1],
  TREATY_RELAY_WORK_MAX_AGE_HOURS: (() => {
    const m = flat.match(/env\["TREATY_RELAY_WORK_MAX_AGE_HOURS"\], (\d+) \* (\d+)/);
    return m ? String(Number(m[1]) * Number(m[2])) : undefined;
  })(),
  TREATY_RELAY_AUDIT_MAX_AGE_DAYS: flat.match(/env\["TREATY_RELAY_AUDIT_MAX_AGE_DAYS"\], (\d+)/)?.[1],
  TREATY_RELAY_DUPLICATE_WINDOW_MINUTES: flat.match(/env\["TREATY_RELAY_DUPLICATE_WINDOW_MINUTES"\], (\d+)/)?.[1],
};
for (const [n, d] of Object.entries(defaults)) {
  if (!d) fail(`check-claims cannot read ${n}'s default from config.ts; update it`);
  else if (!has(settingRows.get(n) ?? '', d)) fail(`relay.md: ${n}'s default is ${d}`);
}
const maxDeliver = flat.match(/s\["maxDeliver"\] === undefined \? (\d+)/)?.[1];
if (!maxDeliver || !relay.includes(`Default \`${maxDeliver}\``)) fail(`relay.md: maxDeliver's default is ${maxDeliver}`);

// Status codes: the page's table is ingest.ts's answers, no more and no fewer.
const codeAnswers = new Set([...ingest.matchAll(/json\((\d{3}), \{\s*error: "([a-z_]+)"/g)].map((m) => `${m[1]} ${m[2]}`));
const pageAnswers = new Set([...relay.matchAll(/^\| (\d{3}) \| `([a-z_]+)` \|/gm)].map((m) => `${m[1]} ${m[2]}`));
if (codeAnswers.size < 8) fail(`read only ${codeAnswers.size} error answers from ingest.ts`);
for (const a of codeAnswers) if (!pageAnswers.has(a)) fail(`relay.md does not list ${a}`);
for (const a of pageAnswers) if (!codeAnswers.has(a)) fail(`relay.md lists ${a}, which the relay never answers`);
if (!/json\(202, \{ id:/.test(ingest.replace(/\s+/g, ' ')) || !/^\| 202 \|/m.test(relay)) fail('relay.md: the 202 answer');
const maxBody = ingest.match(/MAX_BODY_BYTES = 1024 \* 1024;/);
if (!maxBody || !relay.includes('1 MiB')) fail('relay.md: the body limit');

// Retries: 1 s doubling to 5 minutes; the 30-second ack wait; which statuses retry.
if (!/1000 \* 2 \*\* \(deliveryCount - 1\), 5 \* 60_000/.test(deliver)) fail('deliver.ts retryDelayMs changed; update relay.md and check-claims');
if (!relay.includes('1 s, 2 s, 4 s') || !relay.includes('up to 5 minutes')) fail('relay.md: the retry backoff');
if (!/status === 408 \|\| status === 429 \|\| status >= 500/.test(deliver) || !relay.includes('408, 429, 5xx')) fail('relay.md: which statuses are retried');
if (!/ack_wait: nanos\(30_000\)/.test(nats) || !relay.includes('30 seconds')) fail('relay.md: the ack wait');
for (const [n, subj] of [['WORK', 'evt.>'], ['AUDIT', 'audit.>']]) {
  if (!nats.includes(`_STREAM = "${n}"`) || !nats.includes(`subjects: ["${subj}"]`)) fail(`nats.ts no longer has ${n} on ${subj}`);
  for (const p of ['relay.md', 'envelope.md']) if (!has(page(p), n) || !has(page(p), subj)) fail(`${p} does not name ${n} and ${subj}`);
}
if (!nats.includes('durable = `relay-${subscriber.name}`') || !has(relay, 'relay-<name>')) fail('relay.md: the durable consumer name');

// The signature.
const signature = read(join(repo, 'packages/cloudevents/src/signature.ts'));
const header = signature.match(/SIGNATURE_HEADER = "([^"]+)"/)?.[1];
const tolerance = signature.match(/toleranceSeconds = (\d+)/)?.[1];
if (!header || !relay.includes(header)) fail(`relay.md does not name the signature header ${header}`);
if (!tolerance || !relay.includes(`${tolerance} seconds`)) fail(`relay.md: the signature tolerance is ${tolerance} seconds`);
if (!signature.includes('`t=${t},v1=${') || !relay.includes('t=<unix seconds>,v1=<hex HMAC-SHA256>')) fail('relay.md: the signature format');
if (!signature.includes('`${t}.${id}.`') || !relay.includes('<t>.<event id>.<body>')) fail('relay.md: what is signed');

// ---- the envelope -----------------------------------------------------------------------------

const constants = read(join(repo, 'packages/cloudevents/src/constants.ts'));
const required = [...(constants.match(/REQUIRED_ATTRIBUTES = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
const envelope = page('envelope.md');
if (required.length !== 4) fail(`read ${required.length} required attributes from constants.ts`);
for (const a of required) if (!has(envelope, a)) fail(`envelope.md does not name the required attribute ${a}`);
const codec = read(join(repo, 'packages/cloudevents/src/codec.ts'));
if (!codec.includes('/^[a-z0-9]{1,20}$/') || !envelope.includes('1 to 20 characters of `a-z0-9`')) fail('envelope.md: the attribute name rule');
const naming = read(join(repo, 'packages/cloudevents/src/naming.ts'));
if (!naming.includes('`evt.${workspace}.${name.product}.${name.entity}.${name.verb}`') || !envelope.includes('evt.<workspace>.<product>.<entity>.<verb>')) fail('envelope.md: the subject form');
if (!naming.includes('`com.superjackfruit.${name.product}.${name.entity}.${name.verb}.v${version}`') || !envelope.includes('com.superjackfruit.<product>.<entity>.<verb>.v<N>')) fail('envelope.md: the type form');

// ---- the packages -----------------------------------------------------------------------------

const exportsOf = (dir) => {
  const src = join(repo, 'packages', dir, 'src');
  const names = new Set();
  for (const f of readdirSync(src)) {
    for (const m of read(join(src, f)).matchAll(/^export (?:async )?(?:function|const|class|interface|type) ([A-Za-z0-9_]+)/gm)) names.add(m[1]);
  }
  return names;
};
const packageDirs = readdirSync(join(repo, 'packages')).filter((d) => existsSync(join(repo, 'packages', d, 'package.json')));
for (const dir of packageDirs) {
  const pkg = readJson(join(repo, 'packages', dir, 'package.json'));
  if (pkg.private) continue;
  const file = `packages/${dir}.md`;
  const text = pages.get(file);
  if (!text) { fail(`no page ${file} for ${pkg.name}`); continue; }
  if (!text.includes(pkg.name)) fail(`${file} does not name ${pkg.name}`);
  if (!page('packages/index.md').includes(`(/packages/${dir}/)`)) fail(`packages/index.md does not link ${dir}`);
  const names = exportsOf(dir);
  // Every `name()` a package page names is a function the package exports.
  for (const m of text.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)\(\)`/g)) if (!names.has(m[1])) fail(`${file} names ${m[1]}(), which ${pkg.name} does not export`);
}
// The relay and envelope pages name cloudevents and outbox functions.
const shared = new Set([...exportsOf('cloudevents'), ...exportsOf('outbox')]);
for (const p of ['relay.md', 'envelope.md', 'fixtures.md']) {
  for (const m of page(p).matchAll(/`([A-Za-z_][A-Za-z0-9_]*)\(\)`/g)) if (!shared.has(m[1])) fail(`${p} names ${m[1]}(), which no package exports`);
}
// Everything treaty-cloudevents and treaty-outbox export from their entry point is on their page.
for (const dir of ['cloudevents', 'outbox']) {
  const index = read(join(repo, 'packages', dir, 'src/index.ts')).replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [
    ...[...index.matchAll(/export \* as ([A-Za-z]+)/g)].map((m) => m[1]),
    ...[...index.matchAll(/export (?:type )?\{([^}]*)\}/g)].flatMap((m) =>
      m[1].split(',').map((s) => s.trim().replace(/^type /, '')).filter(Boolean),
    ),
  ];
  const text = page(`packages/${dir}.md`);
  for (const n of names) if (!has(text, n) && !has(text, n + '()')) fail(`packages/${dir}.md does not name the export ${n}`);
}
const identity = read(join(repo, 'packages/ecosystem-identity/src/index.ts'));
const corpusFiles = [...(identity.match(/CORPUS_FILES = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const onDisk = readdirSync(join(repo, 'fixtures/ecosystem-identity')).filter((f) => f.endsWith('.json')).sort();
if (JSON.stringify([...corpusFiles].sort()) !== JSON.stringify(onDisk)) fail('CORPUS_FILES is not the corpus on disk');
for (const f of corpusFiles) if (!has(page('packages/ecosystem-identity.md'), f)) fail(`packages/ecosystem-identity.md does not list ${f}`);

// ---- the version ------------------------------------------------------------------------------

const changelog = read(join(repo, 'CHANGELOG.md'));
const released = new Set([...changelog.matchAll(/^## (v\d+\.\d+\.\d+)/gm)].map((m) => m[1]));
const current = changelog.match(/^## (v\d+\.\d+\.\d+)/m)?.[1];
if (!current) fail('no release in CHANGELOG.md');
else {
  if (!page('status.md').includes(`**Current version: ${current}**`)) fail(`status.md: the current version is ${current}`);
  if (!page('packages/index.md').includes(`(${current}`)) fail(`packages/index.md: the current version is ${current}`);
  // Every version a hand-written page names is one that was released.
  for (const [name, text] of handWritten) {
    for (const m of text.matchAll(/(?<![\d.])v?(0\.\d+\.\d+)(?![\d.])/g)) {
      if (m[1] === '0.0.0') continue; // what package.json files on main say; versioning.md explains it
      if (!released.has('v' + m[1])) fail(`${name} names ${m[1]}, which is not a release in CHANGELOG.md`);
    }
  }
  if (!read(join(site, 'astro.config.mjs')).includes(`current version ${current}`)) fail(`astro.config.mjs's llms.txt description: the current version is ${current}`);
}

if (problems.length > 0) {
  console.error(`check-claims: ${problems.length} claim(s) treaty does not back:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `check-claims: ${pages.size} pages; ${keys.length} schemas each with its page, ${catalogTypes.size} CloudEvents types, ` +
    `${matrixTypes.size} Matrix types, ${envNames.size} relay settings, ${codeAnswers.size} relay answers and ` +
    `${packageDirs.length} packages match the code; current version ${current}`,
);
