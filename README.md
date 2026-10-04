# Serene Pub SDK

The pipeline SDK a Serene Pub plugin is built against. Published independently,
so a plugin can depend on the parts it needs and nothing else.

| package | what it is |
|---|---|
| `@serene-pub/sdk` | the runtime: descriptors, the executor, the spec builder, receipts |
| `@serene-pub/contracts` | the node types core ships, as pinned descriptors |
| `@serene-pub/cli` | build-time tooling — the packager and the contracts generator |
| `@serene-pub/conformance` | the suite a host must pass to claim it runs specs |
| `@serene-pub/core-catalog` | core's own announcement: the genres, pipelines and hooks SP ships |
| `@serene-pub/controls` | the Svelte control per value-type id (24 §9) |
| `@serene-pub/component-client` | what a remote component imports — bundled into it by `serene-pub build` |
| `@serene-pub/docs` | the docs compiler: markdown and announcement pages in, one reading order out |
| `@serene-pub/ui-preview` | the surface harness `serene-pub ui` launches — dev-time only |

`@serene-pub/sdk-tests` is the test suite for all of them and is not published.

`controls` and `ui-preview` carry a Svelte (and, for the harness, a SvelteKit
and Vite) dependency; everything else is pure TypeScript. That split is the
reason they are separate packages rather than folders — a plugin that ships no
UI never installs a frontend toolchain.

## Why four rather than one

They keep different time. The runtime changes when the execution model does; the
contracts change whenever core adds a node type, which is far more often; the CLI
is build-time only and must never be importable by a running plugin — if a plugin
could import the thing that computes its own permissions, its manifest would stop
being an independent statement about the code.

## Building

```sh
npm install
npm run build      # every package, in dependency order
npm test -w @serene-pub/sdk-tests   # the suite alone — build first after an edit
```

The build order matters and is encoded in the root script: `contracts`,
`conformance` and `cli` all compile against `sdk`'s emitted types.

## Working on the SDK and Serene Pub together

Serene Pub depends on published `@serene-pub/*` versions, so a normal clone
installs from the registry and needs nothing else. To point it at a local
checkout while changing both at once:

```sh
# in this repo
npm link -w @serene-pub/sdk -w @serene-pub/contracts

# in serene-pub
npm link @serene-pub/sdk @serene-pub/contracts
```

Undo with `npm unlink` in serene-pub followed by `npm install`. Prefer linking
over editing serene-pub's dependency to a `file:` path: a `file:` path in a
committed `package.json` makes a fresh clone of Serene Pub alone fail to install,
and it is the kind of change that reaches CI before anyone notices.

## Releasing

Every package moves together. `node scripts/release.mjs set <version>`, build, test,
commit, then push the tag `v<version>`: `.github/workflows/publish.yml` builds,
tests and publishes all of them to npm (prereleases under `next`). The one-time npm
setup — the organization, the first publish's token, trusted publishing per
package — is in [`RELEASING.md`](RELEASING.md).

## Documents

- `RELEASING.md` — publishing to npm: one-time setup, cutting a release
- `INTEGRATING.md` — what a host has to provide, and in what order
- `DECOMPOSITION.md` — the rulings behind the design, written as the work
  happened rather than summarised after

## Licence

The Serene Pub SDK is licensed under the **Apache License 2.0**.

This is deliberately different from Serene Pub itself, which is **AGPL-3.0**.
The SDK is the contract extensions are written against, so it is permissive:
building on it does not place your extension under the AGPL, and you may ship
your extension under whatever licence you choose, including a proprietary one.

The application remains AGPL — a modified Serene Pub served over a network still
has to offer its source. Permissive SDK, copyleft app: the contract is free to
adopt, the product is not free to close.

"Serene Pub" and its logo are trademarks and are **not** granted by the Apache
licence (§6). See [TRADEMARK.md](https://github.com/doolijb/serene-pub/blob/main/TRADEMARK.md).
