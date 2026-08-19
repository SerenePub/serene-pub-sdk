# Serene Pub SDK

The pipeline SDK a Serene Pub plugin is built against. Four packages, published
independently, so a plugin can depend on the parts it needs and nothing else.

| package | what it is |
|---|---|
| `@serene-pub/sdk` | the runtime: descriptors, the executor, the spec builder, receipts |
| `@serene-pub/contracts` | the node types core ships, as pinned descriptors |
| `@serene-pub/cli` | build-time tooling — the packager and the contracts generator |
| `@serene-pub/conformance` | the suite a host must pass to claim it runs specs |

`@serene-pub/sdk-tests` is the test suite for all of them and is not published.

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
npm test           # builds first, then runs the suite
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

## Documents

- `INTEGRATING.md` — what a host has to provide, and in what order
- `DECOMPOSITION.md` — the rulings behind the design, written as the work
  happened rather than summarised after

## Licence

AGPL-3.0-only, inherited from Serene Pub. **Worth a deliberate decision before
the first publish**: a copyleft licence on an SDK reaches the plugins that link
it, which may not be the intent for a plugin ecosystem. A permissive licence for
the SDK packages with the application staying AGPL is the usual shape, and is a
call for the project owner rather than a detail to inherit by default.
