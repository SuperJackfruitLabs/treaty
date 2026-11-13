// Writes the event catalogue from treaty's own data, before every build (`npm run build`).
//
// It reads, one directory up from docs-site/:
//   schemas/catalog.json                       every CloudEvents type and the schema it names
//   schemas/superpipeline/*.json               the bodies SuperPipeline sends
//   schemas/matrix/*.json                      the board-room Matrix events
//   fixtures/superpipeline-events/examples.json  the bodies each SuperPipeline schema accepts and refuses
//   fixtures/matrix-events/examples.json       the content each Matrix schema accepts and refuses
// and src/data/parties.json, who sends and who reads each one. It writes one page per schema under
// src/content/docs/events/ and src/content/docs/matrix/, and an index for each. Those folders are
// generated: never edit them, and they are not committed. scripts/check-claims.mjs runs next and
// fails the build when a page and the data disagree. No dependencies: Node alone.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(fileURLToPath(import.meta.url), '../..');
const repo = resolve(site, '..');
const docs = join(site, 'src/content/docs');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const GITHUB = 'https://github.com/SuperJackfruitLabs/treaty';
const catalog = readJson(join(repo, 'schemas/catalog.json'));
const parties = readJson(join(site, 'src/data/parties.json'));
const spExamples = readJson(join(repo, 'fixtures/superpipeline-events/examples.json')).schemas;
const mxExamples = readJson(join(repo, 'fixtures/matrix-events/examples.json')).schemas;

/** The page slug for a schema: `superpipeline/gate.pending.v1` -> `events/gate-pending-v1`. */
export function slugOf(key) {
  const [dir, name] = key.split('/');
  if (dir === 'superpipeline') return `events/${name.replace(/[._]/g, '-')}`;
  const group = parties.schemas[key]?.group ?? 'other';
  return `matrix/${group}/${name.replace(/^dev\./, '').replace(/[._]/g, '-')}`;
}

/** Every schema treaty holds, as `<dir>/<name>` keys. */
export function schemaKeys() {
  return ['superpipeline', 'matrix'].flatMap((dir) =>
    readdirSync(join(repo, 'schemas', dir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => `${dir}/${f.slice(0, -5)}`),
  );
}

// ---- reading a schema -------------------------------------------------------------------------

function deref(schema, node, seen = new Set()) {
  if (!node || typeof node !== 'object') return node;
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/$defs/')) {
    const name = node.$ref.slice('#/$defs/'.length);
    if (seen.has(name)) return { ...node, $cycle: name };
    const target = schema.$defs?.[name];
    if (!target) throw new Error(`${schema.$id}: no $defs/${name}`);
    const { $ref, ...rest } = node;
    return { ...deref(schema, target, new Set([...seen, name])), ...rest, $defName: name };
  }
  return node;
}

const code = (s) => '`' + String(s).replace(/`/g, "'") + '`';
/** One line of Markdown for a table cell: pipes escaped, and `<` escaped outside code spans only. */
const cell = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/</g, '&lt;')))
    .join('')
    .replace(/\|/g, '\\|')
    .trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function typeOf(schema, node) {
  node = deref(schema, node);
  if (!node || typeof node !== 'object') return '';
  if ('const' in node) return code(JSON.stringify(node.const));
  if (node.enum) return 'one of ' + node.enum.map((v) => code(JSON.stringify(v))).join(', ');
  const alts = node.oneOf ?? node.anyOf;
  if (alts && !node.type) {
    return alts
      .map((a, i) => {
        const t = typeOf(schema, a) || 'object';
        return t === 'object' ? `object (${branchLabel(schema, a, i)})` : t;
      })
      .join(' or ');
  }
  const t = Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
  return t
    .map((x) => {
      if (x !== 'array') return x;
      const items = deref(schema, node.items);
      const inner = items ? typeOf(schema, items) : '';
      return inner ? `array of ${inner}` : 'array';
    })
    .join(' or ');
}

const CONSTRAINTS = [
  ['format', (v) => `format ${code(v)}`],
  ['pattern', (v) => `pattern ${code(v)}`],
  ['minLength', (v) => `at least ${plural(v, 'character', 'characters')}`],
  ['maxLength', (v) => `at most ${plural(v, 'character', 'characters')}`],
  ['minimum', (v) => `at least ${v}`],
  ['maximum', (v) => `at most ${v}`],
  ['exclusiveMinimum', (v) => `more than ${v}`],
  ['minItems', (v) => `at least ${plural(v, 'item', 'items')}`],
  ['maxItems', (v) => `at most ${plural(v, 'item', 'items')}`],
  ['default', (v) => `default ${code(JSON.stringify(v))}`],
];

function constraintsOf(schema, node) {
  node = deref(schema, node);
  const out = [];
  for (const [k, f] of CONSTRAINTS) if (node?.[k] !== undefined) out.push(f(node[k]));
  if (node?.type === 'array' || (Array.isArray(node?.type) && node.type.includes('array'))) {
    const items = deref(schema, node.items);
    if (items) for (const [k, f] of CONSTRAINTS) if (items[k] !== undefined) out.push(`each: ${f(items[k])}`);
  }
  return out.join('; ');
}

/** A label for one branch of a oneOf/anyOf: its def name, or its discriminating const. */
function branchLabel(schema, branch, i) {
  const b = deref(schema, branch);
  if (b.$defName) return b.$defName;
  for (const [k, p] of Object.entries(b.properties ?? {})) if (p && 'const' in p) return `${k} = ${JSON.stringify(p.const)}`;
  if (b.required?.length) return `with ${b.required.join(', ')}`;
  return `shape ${i + 1}`;
}

/** Flattens a schema into field rows: dotted paths, `[]` for each item of a list. */
export function fieldRows(schema, node = schema, prefix = '', shape = '', depth = 0, rows = []) {
  node = deref(schema, node);
  if (!node || depth > 6) return rows;
  const required = new Set(node.required ?? []);
  for (const [name, raw] of Object.entries(node.properties ?? {})) {
    const child = deref(schema, raw);
    const path = prefix + name;
    rows.push({
      path,
      type: typeOf(schema, child),
      required: required.has(name),
      description: child.description ?? '',
      constraints: [shape && `in the ${code(shape)} shape`, constraintsOf(schema, child)].filter(Boolean).join('; '),
    });
    descend(schema, child, path, shape, depth, rows);
  }
  return rows;
}

function descend(schema, child, path, shape, depth, rows) {
  if (child.$cycle) return;
  if (child.properties) fieldRows(schema, child, path + '.', shape, depth + 1, rows);
  const alts = child.oneOf ?? child.anyOf;
  if (alts) {
    alts.forEach((alt, i) => {
      const a = deref(schema, alt);
      if (a.properties) fieldRows(schema, a, path + '.', branchLabel(schema, alt, i), depth + 1, rows);
      else if (a.items) descend(schema, a, path, branchLabel(schema, alt, i), depth, rows);
    });
  }
  if (child.items) {
    const items = deref(schema, child.items);
    if (items.properties) fieldRows(schema, items, path + '[].', shape, depth + 1, rows);
    const itemAlts = items.oneOf ?? items.anyOf;
    if (itemAlts) {
      itemAlts.forEach((alt, i) => {
        const a = deref(schema, alt);
        if (a.properties) fieldRows(schema, a, path + '[].', branchLabel(schema, alt, i), depth + 1, rows);
      });
    }
  }
}

function fieldTable(schema) {
  const rows = fieldRows(schema);
  const lines = ['| Field | Type | Required | Description | Constraints |', '| --- | --- | --- | --- | --- |'];
  for (const r of rows) {
    lines.push(`| ${code(r.path)} | ${cell(r.type)} | ${r.required ? 'yes' : 'no'} | ${cell(r.description)} | ${cell(r.constraints)} |`);
  }
  return lines.join('\n');
}

/** Rules a field table cannot show: combinators and conditionals at the top level. */
function furtherRules(schema) {
  const keys = ['allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else'].filter((k) => k in schema);
  const out = [];
  if (keys.length) {
    const rules = Object.fromEntries(keys.map((k) => [k, schema[k]]));
    out.push(
      'The schema also states these rules across fields, as written:',
      '',
      '```json',
      JSON.stringify(rules, null, 2),
      '```',
    );
  }
  if (schema['x-uniqueBy']) {
    out.push(
      '',
      '`x-uniqueBy`: the values at these paths must not repeat, the one rule JSON Schema cannot state. `a[].b` is field `b` of each item of list `a`.',
      '',
      ...schema['x-uniqueBy'].map((p) => `- ${code(p)}`),
    );
  }
  return out.join('\n');
}

const fence = (value) => '```json\n' + JSON.stringify(value, null, 2) + '\n```';

function examplesSection(cases, corpusPath) {
  if (!cases) return `No examples for this schema in \`${corpusPath}\`.`;
  const valid = Object.entries(cases.valid ?? {});
  const invalid = cases.invalid ?? [];
  const out = [];
  if (valid.length) {
    const [label, body] = valid[0];
    out.push(`From \`${corpusPath}\`, case “${cell(label)}”:`, '', fence(body));
    if (valid.length > 1) {
      out.push('', `The corpus has ${valid.length} valid cases in all:`, '');
      for (const [l, b] of valid.slice(1)) {
        out.push(`<details><summary>${cell(l)}</summary>`, '', fence(b), '', '</details>', '');
      }
    }
  }
  if (invalid.length) {
    out.push('', '### Refused', '', 'Each of these must fail. The corpus says why:', '');
    for (const c of invalid) {
      const by = c.refusedBy ? ` (refused by ${code(c.refusedBy)})` : '';
      out.push(`- ${cell(c.why)}${by}`);
    }
  }
  return out.join('\n');
}

const productLink = (p) => (parties.products[p] ? `[${p}](${parties.products[p]})` : p);

function yamlString(s) {
  return JSON.stringify(String(s).replace(/\s+/g, ' ').trim());
}

function frontmatter({ title, description, order }) {
  return ['---', `title: ${yamlString(title)}`, `description: ${yamlString(description)}`, `sidebar:`, `  order: ${order}`, '---', ''].join('\n');
}

const GENERATED = "<!-- Generated by scripts/generate.mjs from treaty's schemas and fixtures. Do not edit. -->";

// ---- SuperPipeline events ---------------------------------------------------------------------

/** `com.superjackfruit.superpipeline.card_comment.added.v1` -> `evt.<workspace>.superpipeline.card_comment.added`. */
export function subjectOf(type) {
  const m = /^com\.superjackfruit\.([^.]+)\.([^.]+)\.([^.]+)\.v[1-9][0-9]*$/.exec(type);
  if (!m) throw new Error(`not a suite event type: ${type}`);
  return `evt.<workspace>.${m[1]}.${m[2]}.${m[3]}`;
}

function eventPage(key, order) {
  const name = key.split('/')[1];
  const schema = readJson(join(repo, 'schemas', key + '.json'));
  const who = parties.schemas[key];
  const types = catalog.events.filter((e) => e.dataschema === schema.$id);
  const version = name.match(/\.v(\d+)$/)?.[1];
  const title = `${name.replace(/\.v\d+$/, '')} v${version}`;
  const out = [
    frontmatter({ title, description: `${schema.title}: its CloudEvents types, subjects, fields and examples.`, order }),
    GENERATED,
    '',
    cell(schema.description).replace(/\\\|/g, '|'),
    '',
    '## CloudEvents',
    '',
    `Every event below carries \`dataschema\` ${code(schema.$id)}.`,
    '',
    '| Body `event` | CloudEvents `type` | Subject |',
    '| --- | --- | --- |',
    ...types.map((e) => `| ${code(e.pushName)} | ${code(e.type)} | ${code(subjectOf(e.type))} |`),
    '',
    'The subject is the NATS subject the relay files it under; `<workspace>` is the board\'s workspace. See [the envelope and subjects](/envelope/).',
    '',
    '## Who sends it, who reads it',
    '',
    `- **Produced by** ${who.producers.map(productLink).join(', ')}${who.relayed ? ', through [the relay](/relay/)' : ', by direct push only (not relayed)'}.`,
  ];
  if (who.consumers.length) {
    out.push('- **Consumed by:**');
    for (const c of who.consumers) out.push(`  - ${productLink(c.product)}: ${c.how}`);
  }
  if (who.note) out.push('', who.note);
  out.push(
    '',
    '## Fields',
    '',
    'Readers ignore properties they do not know, so a field may be added without a new version.',
    '',
    fieldTable(schema),
    '',
    furtherRules(schema),
    '',
    '## Example',
    '',
    examplesSection(spExamples[name], 'fixtures/superpipeline-events/examples.json'),
    '',
    '## Source',
    '',
    `- Schema: [\`schemas/${key}.json\`](${GITHUB}/blob/main/schemas/${key}.json)`,
    `- In the package: \`import schema from "@superjackfruitlabs/treaty-event-schemas/${key}.json" with { type: "json" };\``,
    '',
  );
  return out.join('\n');
}

// ---- Matrix events ----------------------------------------------------------------------------

const GROUPS = {
  cards: { label: 'Cards', what: 'what the carrier posts for a person to decide' },
  answers: { label: 'Answers', what: 'what a person sends back from a client' },
  receipts: { label: 'Receipts', what: 'what closes a card once the board accepted a decision' },
  notices: { label: 'Notices', what: 'replies that report progress on a card' },
  permissions: { label: 'Permissions', what: "AgentPod's harness permission prompts, in a station room" },
};

function howItRides(name, schema) {
  const marker = schema.properties?.suite_event_type?.const;
  if (marker && schema.properties?.msgtype) return `An \`m.room.message\` whose content carries \`suite_event_type: "${marker}"\`.`;
  if (marker) return `Content that carries \`suite_event_type: "${marker}"\`.`;
  if (/embedded/i.test(schema.title ?? '')) return `A card inside the prose message's content, under the content key \`${name}\`.`;
  return `A custom Matrix event of type \`${name}\`, sent beside its prose message.`;
}

function matrixPage(key, order) {
  const name = key.split('/')[1];
  const schema = readJson(join(repo, 'schemas', key + '.json'));
  const who = parties.schemas[key];
  const embedded = /embedded/i.test(schema.title ?? '');
  const title = embedded ? `${name} (embedded card)` : name;
  const out = [
    frontmatter({ title, description: `The ${name} Matrix event: how it rides, who sends and reads it, its fields and examples.`, order }),
    GENERATED,
    '',
    cell(schema.description).replace(/\\\|/g, '|'),
    '',
    '## How it rides',
    '',
    howItRides(name, schema),
    '',
    '## Who sends it, who reads it',
    '',
    `- **Sent by** ${who.sentBy.map(productLink).join(', ')}.`,
    `- **Read by** ${who.readBy.map(productLink).join(', ')}.`,
  ];
  if (who.sentBy.length > 1 || who.readBy.length > 1) out.push('', parties.carrierNote);
  out.push(
    '',
    '## Fields',
    '',
    fieldTable(schema),
    '',
    furtherRules(schema),
    '',
    '## Example',
    '',
    examplesSection(mxExamples[name], 'fixtures/matrix-events/examples.json'),
    '',
    '## Source',
    '',
    `- Schema: [\`schemas/${key}.json\`](${GITHUB}/blob/main/schemas/${key}.json)`,
    `- In the package: \`import schema from "@superjackfruitlabs/treaty-matrix-events/schemas/${name}.json" with { type: "json" };\``,
    '',
  );
  return out.join('\n');
}

// ---- indexes ----------------------------------------------------------------------------------

function eventsIndex(keys) {
  const rows = catalog.events.map((e) => {
    const key = Object.keys(parties.schemas).find(
      (k) => k.startsWith('superpipeline/') && readJson(join(repo, 'schemas', k + '.json')).$id === e.dataschema,
    );
    return `| ${code(e.type)} | [${key.split('/')[1]}](/${slugOf(key)}/) | ${parties.schemas[key].relayed ? 'yes' : 'no'} |`;
  });
  return [
    frontmatter({ title: 'Event catalogue', description: 'Every CloudEvents type treaty has a schema for, and the page for each schema.', order: 0 }),
    GENERATED,
    '',
    `Every CloudEvents type in \`schemas/catalog.json\`: ${catalog.events.length} types over ${keys.length} schemas. A schema can serve more than one type; the record schema serves all ${catalog.events.filter((e) => e.dataschema.endsWith('/record.v1.json')).length} record events.`,
    '',
    '| CloudEvents `type` | Schema | Relayed |',
    '| --- | --- | --- |',
    ...rows,
    '',
    '## Not here',
    '',
    ...catalog.elsewhere.map((e) => `- **${e.what}.** ${e.note} Schema: <${e.schema}>`),
    '',
  ].join('\n');
}

function matrixIndex(keys) {
  const out = [
    frontmatter({ title: 'Matrix events', description: 'Every board-room Matrix event treaty has a schema for, by what it does.', order: 0 }),
    GENERATED,
    '',
    `The board-room contract, published as \`@superjackfruitlabs/treaty-matrix-events\`: ${keys.length} schemas, one per event type. A type string never changes; a breaking change is a new type beside the old one (\`.v1\` to \`.v2\`).`,
    '',
  ];
  for (const [g, { label, what }] of Object.entries(GROUPS)) {
    const inGroup = keys.filter((k) => parties.schemas[k].group === g);
    out.push(`## ${label}`, '', `${what[0].toUpperCase()}${what.slice(1)}.`, '');
    for (const k of inGroup) out.push(`- [\`${k.split('/')[1]}\`](/${slugOf(k)}/)`);
    out.push('');
  }
  return out.join('\n');
}

// ---- write ------------------------------------------------------------------------------------

export function generate() {
  const keys = schemaKeys();
  for (const k of keys) if (!parties.schemas[k]) throw new Error(`generate: src/data/parties.json has no entry for ${k}`);
  const slugs = new Map();
  for (const k of keys) {
    const s = slugOf(k);
    if (slugs.has(s)) throw new Error(`generate: ${k} and ${slugs.get(s)} would share the page ${s}`);
    slugs.set(s, k);
  }
  for (const dir of ['events', 'matrix']) rmSync(join(docs, dir), { recursive: true, force: true });
  mkdirSync(join(docs, 'events'), { recursive: true });
  const sp = keys.filter((k) => k.startsWith('superpipeline/'));
  const mx = keys.filter((k) => k.startsWith('matrix/'));
  writeFileSync(join(docs, 'events/index.md'), eventsIndex(sp));
  sp.forEach((k, i) => writeFileSync(join(docs, slugOf(k) + '.md'), eventPage(k, i + 1)));
  mkdirSync(join(docs, 'matrix'), { recursive: true });
  writeFileSync(join(docs, 'matrix/index.md'), matrixIndex(mx));
  const groupOrder = Object.keys(GROUPS);
  for (const g of groupOrder) mkdirSync(join(docs, 'matrix', g), { recursive: true });
  for (const k of mx) {
    const g = parties.schemas[k].group;
    const order = groupOrder.indexOf(g) * 100 + mx.filter((x) => parties.schemas[x].group === g).indexOf(k) + 1;
    writeFileSync(join(docs, slugOf(k) + '.md'), matrixPage(k, order));
  }
  return { sp: sp.length, mx: mx.length, slugs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { sp, mx } = generate();
  console.log(`generate: ${sp} event pages and ${mx} Matrix event pages, from ${sp + mx} schemas`);
}
