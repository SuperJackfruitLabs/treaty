# @superjackfruitlabs/treaty-contracts

Every contract between Super Jackfruit Labs products, as data, with validators and the `treaty`
CLI a product runs in CI.

```sh
npx -y @superjackfruitlabs/treaty-contracts@<version> verify
```

- `data/`: every JSON file under treaty's `schemas/`, `fixtures/` and `contracts/`, and
  `data/manifest.json` with the release version and each file's sha256.
- `treaty verify`: checks the repository's `treaty.json` against the release: the crossings it
  produces and consumes, the pin, and every vendored copy, byte for byte.
- `treaty sync`: rewrites the vendored copies from the release.
- `treaty cases <schema path>`: prints a schema's valid and invalid cases as JSON, for test
  harnesses in any language.
- The main entry validates bodies against schemas and OpenAPI 3.1 documents offline, and runs in
  Workers. `./node` adds loading from disk, `verify` and `sync`.

Documentation: <https://treaty.superjackfruit.com/packages/contracts/>. Source and the crossing
registry: <https://github.com/SuperJackfruitLabs/treaty>. MIT.
