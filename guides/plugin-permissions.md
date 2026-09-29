# What a plugin may do

Each kind of hook is handed a `ctx` with exactly these members and nothing else: the table is read from the one the sandboxes enforce. `random`, `now`, `log` and `signal` are every kind's. A refusal that stems from a row below names the row.

<!-- Generated from the SDK (`renderPluginPermissionsGuide`, sdk/src/pluginPermissions.ts). Do not edit by hand. -->

| Kind | Its `ctx` | What it is |
|---|---|---|
| [task](#kind-task) | `random` · `now` · `log` · `signal` | A node that computes: data in, data out. |
| [query](#kind-query) | `random` · `now` · `log` · `storage` · `signal` | A node that reads its package's own storage; Serene Pub's own data is read by core's query nodes. |
| [oracle](#kind-oracle) | `random` · `now` · `log` · `storage` · `fetch` · `signal` | The one node kind that calls out: the network, through the hosts your manifest declares. |
| [outlet](#kind-outlet) | `random` · `now` · `log` · `storage` · `signal` | A node at the end of a pipeline that acts on the run's result. |
| [chain-link](#kind-chain-link) | `random` · `now` · `log` · `signal` | A script link: text in, text out. |
| [event](#kind-event) | `random` · `now` · `log` · `storage` · `signal` | A listener for a session event. |
| [lifecycle](#kind-lifecycle) | `random` · `now` · `log` · `storage` · `signal` | Startup, enable, disable, update, uninstall, shutdown. |

## Kind: task

A node that computes: data in, data out.

- Handed: `random`, `now`, `log`, `signal`.
- No storage.
- No network.

## Kind: query

A node that reads its package's own storage; Serene Pub's own data is read by core's query nodes.

- Handed: `random`, `now`, `log`, `storage`, `signal`.
- Storage: its own package's rows and files, when its manifest declares the storage permission.
- No network.

## Kind: oracle

The one node kind that calls out: the network, through the hosts your manifest declares.

- Handed: `random`, `now`, `log`, `storage`, `fetch`, `signal`.
- Storage: its own package's rows and files, when its manifest declares the storage permission.
- Network: only the hosts its manifest declares and an admin left allowed.

## Kind: outlet

A node at the end of a pipeline that acts on the run's result.

- Handed: `random`, `now`, `log`, `storage`, `signal`.
- Storage: its own package's rows and files, when its manifest declares the storage permission.
- No network.

## Kind: chain-link

A script link: text in, text out.

- Handed: `random`, `now`, `log`, `signal`.
- No storage.
- No network.

## Kind: event

A listener for a session event.

- Handed: `random`, `now`, `log`, `storage`, `signal`.
- Storage: its own package's rows and files, when its manifest declares the storage permission.
- No network.

## Kind: lifecycle

Startup, enable, disable, update, uninstall, shutdown.

- Handed: `random`, `now`, `log`, `storage`, `signal`.
- Storage: its own package's rows and files, when its manifest declares the storage permission.
- No network.

## Rules for every kind

### Connections

**Plugins never touch a connection.** A plugin's code never reads connection data or calls a model; model calls are core's nodes. It may know only which capabilities are available. A node that uses a connection takes only core's stand-ins: shape it with your own prompts or a config instead. (R53)

### Private nodes

**A node is as public as its handler.** `handler(definition, fn, { visibility: 'public' })` makes a node usable by any package's pipeline, or by one a person makes; private is the default. A definition never says `public` itself. A swap contribution must be public: it runs your node in another package's pipeline. Refused at build, install, publish and run. (R62)

### Secrets

**Secrets are handles.** A `secret` setting reaches your code as a handle (`⟦secret:<key>:<nonce>⟧`), never its value; `ctx.fetch` fills the value in for your declared hosts only, an echoed or quoted key comes back as the handle, and anything you return, throw, log or store is scrubbed of it. When your node or tool runs in a pipeline another package owns, or one a person made, only the secrets you mark `lend: true` go with it. (R63)

### Events

**Events are caused by writes.** No node emits an event or starts a pipeline. A package records its own declared event with the `record-event` write, within the scope its entry declares, and everything in the session hears it. (F8)
