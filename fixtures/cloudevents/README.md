# CloudEvents binary mode: test cases

`binary-mode.json` is what `@superjackfruitlabs/treaty-cloudevents` must do with CloudEvents 1.0
in binary content mode, over HTTP and over NATS headers. It is plain JSON so a Go or Swift codec
can run the same cases. `howToRead` in the file says what each section asks.

## Where the cases come from

- **`full-event` and `min-event`** are the Go SDK's `FullEvent` and `MinEvent`
  (`cloudevents/sdk-go`, `v2/test/event_mocks.go`), written as canonical strings: every extension
  type, a time with fractional seconds, binary data in base64, and a JSON string body.
- **Header encoding** follows the HTTP protocol binding and the NATS protocol binding (1.0.3-wip):
  percent-encode space, `"`, `%` and everything outside U+0021-U+007E, one `%XY` per UTF-8 byte;
  decode one round, accept unnecessary or lower-case encoding, reject bytes that are not UTF-8.
  HTTP also unquotes a quoted-string header value first.
- **HTTP** carries `datacontenttype` as `Content-Type`, and a `ce-datacontenttype` header is an
  error. **NATS** carries it as `ce-datacontenttype`, like every other attribute.

## A known difference from the Go SDK

The Go SDK's NATS JetStream binding writes header values without percent-encoding. For values made
only of printable ASCII other than `"` and `%`, that is the same bytes. A Go producer that sends a
space, a `%` or non-ASCII text in an attribute over NATS will not round-trip through this codec,
which follows the binding spec. Suite producers use this codec, so the case does not arise between
them.
