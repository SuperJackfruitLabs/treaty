# HTTP contracts

One OpenAPI 3.1 document per API, in JSON, at `schemas/http/<owner>/<api>.v<N>.openapi.json`.
The owner is the product that serves the API. Its cases live at
`fixtures/http/<owner>/<api>.v<N>.cases.json`:

```json
{
  "operations": {
    "<operationId>": {
      "request": {
        "valid": { "<label>": {} },
        "invalid": [{ "why": "", "body": {} }]
      },
      "responses": { "200": { "valid": { "<label>": {} }, "invalid": [] } }
    }
  }
}
```

Every document keeps these rules, checked by `scripts/openapi.test.ts`:

- `openapi` is `3.1.x`, and every `operationId` is unique.
- Every `$ref` resolves inside treaty, so validation never reaches the network.
- Bodies are `application/json`. A response without content accepts only an empty body.
- Every 4xx and 5xx response is the document's error envelope, `schemas/common/<envelope>.json`,
  named by `x-treaty-error-envelope` (`error.v1` when it names none). The suite's envelopes are
  `error.v1`, `flat-error.v1` and `matrix-error.v1`; `oauth-bearer-error.v1` is RFC 6750's.
- An operation names the codes it may return in `x-treaty-error-codes`. Each is the owner's in
  `contracts/error-codes.json`, recorded in the document's envelope. In `oauth-bearer-error.v1`
  a code is RFC 6750's (the schema's `$defs/standardCode`) or the owner's `flat-error.v1` code.
- Every request has valid and invalid cases, and every success response has valid cases. An
  error response may have cases too, for the fields a document pins beside a code. Each case
  validates as it is labelled.
- An `http` crossing in `contracts/registry.json` names the document.

Within a version, a document may only add: new operations, new optional properties, new response
statuses. Anything else is a new `v<N+1>` document beside the old one. `bun run compat` enforces
this.

`@superjackfruitlabs/treaty-contracts` reads these documents: `openApi`, `matchRoute`,
`validateRequest` and `validateResponse`.
