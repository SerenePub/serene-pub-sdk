# What a plugin may do

Your plugin's code runs in a sandbox, and what it may do depends on what kind of handler it is. Each kind is handed a `ctx` with exactly these members and nothing else: `random`, `now`, `log` and `signal` are every kind's, and storage and network are granted by kind. This page is generated from the table the sandboxes enforce, and a refusal names the section below that explains it. For what each part of a plugin is for, see [What a plugin can do](extending.md).

<!-- Generated from the SDK (`renderPluginPermissionsGuide`, sdk/src/pluginPermissions.ts). Do not edit by hand. -->

| Kind | Its `ctx` | What it is |
|---|---|---|
| [task](#kind-task) | `random` · `now` · `log` · `signal` | A node that computes: data in, data out. |
| [query](#kind-query) | `random` · `now` · `log` · `storage` · `signal` | A node that reads. Yours reads your plugin's own storage; Serene Pub's data reaches it on its input ports, from core's queries. |
| [oracle](#kind-oracle) | `random` · `now` · `log` · `storage` · `fetch` · `signal` | The one node kind that calls out: the network, through the hosts your plugin declares. Never a model: model calls are core's nodes. |
| [outlet](#kind-outlet) | `random` · `now` · `log` · `storage` · `signal` | A node that writes. Yours declares `effects: 'emit'`: it writes your own storage and passes values on, and core's outlets write to the session. |
| [chain-link](#kind-chain-link) | `random` · `now` · `log` · `signal` | A link in a script chain: text in, text out. |
| [event](#kind-event) | `random` · `now` · `log` · `storage` · `signal` | An event listener: runs when a session event happens. |
| [lifecycle](#kind-lifecycle) | `random` · `now` · `log` · `storage` · `signal` | A lifecycle callback: runs at startup, enable, disable, update, uninstall or shutdown. |

## Kind: task

A node that computes: data in, data out.

- Handed: `random`, `now`, `log`, `signal`.
- No storage.
- No network.

## Kind: query

A node that reads. Yours reads your plugin's own storage; Serene Pub's data reaches it on its input ports, from core's queries.

- Handed: `random`, `now`, `log`, `storage`, `signal`.
- Storage: your plugin's own rows and files, when it asks for storage (`permissions.storage`).
- No network.

## Kind: oracle

The one node kind that calls out: the network, through the hosts your plugin declares. Never a model: model calls are core's nodes.

- Handed: `random`, `now`, `log`, `storage`, `fetch`, `signal`.
- Storage: your plugin's own rows and files, when it asks for storage (`permissions.storage`).
- Network: only the hosts your plugin declares (`permissions.network.hosts`) and an admin left allowed.

## Kind: outlet

A node that writes. Yours declares `effects: 'emit'`: it writes your own storage and passes values on, and core's outlets write to the session.

- Handed: `random`, `now`, `log`, `storage`, `signal`.
- Storage: your plugin's own rows and files, when it asks for storage (`permissions.storage`).
- No network.

## Kind: chain-link

A link in a script chain: text in, text out.

- Handed: `random`, `now`, `log`, `signal`.
- No storage.
- No network.

## Kind: event

An event listener: runs when a session event happens.

- Handed: `random`, `now`, `log`, `storage`, `signal`.
- Storage: your plugin's own rows and files, when it asks for storage (`permissions.storage`).
- No network.

## Kind: lifecycle

A lifecycle callback: runs at startup, enable, disable, update, uninstall or shutdown.

- Handed: `random`, `now`, `log`, `storage`, `signal`.
- Storage: your plugin's own rows and files, when it asks for storage (`permissions.storage`).
- No network.

## Rules for every kind

### Connections

**Plugins never touch a connection.** A plugin's code never reads connection data or calls a model; model calls are core's nodes. It may know only which capabilities are available. A node that uses a connection takes only core's stand-ins: shape it with your own prompts or a config instead.

### Private nodes

**A node is as public as its handler.** `handler(definition, fn, { visibility: 'public' })` makes a node usable by any package's pipeline, or by one a person makes; private is the default. A definition never says `public` itself. A swap contribution must be public: it runs your node in another package's pipeline. Refused at build, install, publish and run.

### Secrets

**Secrets are handles.** A `secret` setting reaches your code as a handle (`⟦secret:<key>:<nonce>⟧`), never its value; `ctx.fetch` fills the value in for your declared hosts only, an echoed or quoted key comes back as the handle, and anything you return, throw, log or store is scrubbed of it. When your node or tool runs in a pipeline another package owns, or one a person made, only the secrets you mark `lend: true` go with it.

### Events

**Events are caused by writes.** No node emits an event or starts a pipeline. A package records its own declared event with the `record-event` write, within the scope its entry declares, and everything in the session hears it.
