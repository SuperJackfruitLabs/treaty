---
title: The envelope and subjects
description: "Every suite event is a CloudEvents 1.0 event in binary content mode, filed under a subject and typed by one naming rule."
---

Every event a product sends to another is a [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)
event in **binary content mode**: the context attributes travel as headers and the body is the
event's data, untouched. `@superjackfruitlabs/treaty-cloudevents` is the codec.

## Attributes

An event is its attributes as canonical strings plus its data as bytes, so the same shape crosses
every binding and every language.

- **Required:** `id`, `source`, `specversion` and `type`. `specversion` is always `1.0`.
- **Names:** every attribute name, extensions included, is 1 to 20 characters of `a-z0-9`.
- **Typed values** (a time, an integer) are the producer's business: it writes their canonical
  string form.
- **`dataschema`** names the JSON Schema the data follows: the schema's `$id`, its address on the
  public repository. The [catalogue](/events/) lists every one.

`validate()` throws unless the attributes are a valid context.

## Over HTTP and over NATS

| | HTTP | NATS |
| --- | --- | --- |
| Attributes | `ce-<name>` headers | `ce-<name>` headers |
| `datacontenttype` | the `Content-Type` header; a `ce-datacontenttype` header is an error | `ce-datacontenttype`, like every other attribute |
| Quoted header values | unquoted, then percent-decoded | percent-decoded |

`toBinary(event, binding)` and `fromBinary(message, binding)` convert, with `binding` one of
`http` or `nats`. Structured and batched content modes are refused: a `Content-Type` of
`application/cloudevents…` fails to decode.

**Header encoding** follows both protocol bindings. A sender percent-encodes space, `"`, `%` and
every character outside U+0021 to U+007E, one `%XY` per UTF-8 byte, in upper-case hex. A receiver
decodes one round, accepts unnecessary or lower-case encoding, and refuses bytes that are not
UTF-8. `percentEncode()` and `percentDecode()` do this.

The Go SDK's NATS JetStream binding writes header values without percent-encoding. For printable
ASCII other than `"` and `%` that is the same bytes; a Go producer that sends a space, a `%` or
non-ASCII text over NATS will not round-trip through this codec, which follows the binding spec.

## Subjects

A subject is where an event is filed in NATS:

```
evt.<workspace>.<product>.<entity>.<verb>
```

for example `evt.ws_123.superpipeline.card.completed`. Tenancy and filtering work on prefixes: a
subscriber to `evt.*.superpipeline.>` receives every SuperPipeline event in every workspace.

- `<workspace>` is letters, digits, `_` or `-`.
- `<product>`, `<entity>` and `<verb>` each start with a lower-case letter, then lower-case letters,
  digits or `_`. A two-word entity is joined with `_`: SuperPipeline's `card.comment.added` is the
  entity `card_comment` and the verb `added`.

`eventSubject(workspace, name)` builds one and `parseSubject(subject)` reads one back.

## Types

```
com.superjackfruit.<product>.<entity>.<verb>.v<N>
```

`<N>` is a positive whole number. `eventType(name, version)` builds one and `parseType(type)` reads
it back.

**The version lives in `type` and `dataschema`, never in the subject**, so a subscriber's filter
catches every version of an event and the subscriber decides which shapes it reads. See
[Versioning and compatibility](/versioning/).

## Two streams

The relay keeps two JetStream streams: `WORK` holds `evt.>` and `AUDIT` holds `audit.>`. A slow
audit consumer never holds up work, and purging work never touches audit. No audit event has a
schema yet.

## What SuperPipeline sends

As an example of the envelope in use, this is what SuperPipeline puts on each event it relays
(`apps/api/src/push/relay.ts` in its repository):

| Attribute | Value |
| --- | --- |
| `id` | `<board id>:<delivery id>`, fixed per delivery row, so a retry is a duplicate |
| `source` | `/superpipeline/boards/<board id>` |
| `type` | from the body's `event`, for example `com.superjackfruit.superpipeline.gate.pending.v1` |
| `time` | the body's `ts` |
| `datacontenttype` | `application/json` |
| `dataschema` | the schema the catalogue names for that event |

and the subject is `evt.<the board's workspace>.superpipeline.<entity>.<verb>`. Each event page in
the [catalogue](/events/) gives its type and subject.
