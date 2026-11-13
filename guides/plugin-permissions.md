# What a plugin may do

Your plugin's code runs in a sandbox, and what it may do depends on what kind of handler it is. Each kind is handed a `ctx` with exactly these members and nothing else: `random`, `now`, `log` and `signal` are every kind's, and storage, package files, the person's saved data and network are granted by kind. This page is generated from the table the sandboxes enforce, and a refusal names the section below that explains it. For what each part of a plugin is for, see [What a plugin can do](extending.md).

<!-- Generated from the SDK (`renderPluginPermissionsGuide`, sdk/src/pluginPermissions.ts). Do not edit by hand. -->

| Kind | Its `ctx` | What it is |
|---|---|---|
| [task](#kind-task) | `random` · `now` · `log` · `signal` | A node that computes: data in, data out. |
| [query](#kind-query) | `random` · `now` · `log` · `storage` · `package` · `annex` · `signal` | A node that reads. Yours reads your plugin's own storage; Serene Pub's data reaches it on its input ports, from core's queries. |
| [oracle](#kind-oracle) | `random` · `now` · `log` · `storage` · `package` · `annex` · `fetch` · `signal` | The one node kind that calls out: the network, through the hosts your plugin declares. Never a model: model calls are core's nodes. |
| [outlet](#kind-outlet) | `random` · `now` · `log` · `storage` · `package` · `annex` · `signal` | A node that writes. Yours declares `effects: 'emit'`: it writes your own storage and passes values on, and core's outlets write to the session. |
| [chain-link](#kind-chain-link) | `random` · `now` · `log` · `signal` | A link in a script chain: text in, text out. |
| [event](#kind-event) | `random` · `now` · `log` · `storage` · `package` · `annex` · `signal` | An event listener: runs when a session event happens. |
| [lifecycle](#kind-lifecycle) | `random` · `now` · `log` · `storage` · `package` · `annex` · `signal` | A lifecycle callback: runs at startup, enable, disable, update, uninstall or shutdown. |

## Kind: task

A node that computes: data in, data out.

- Handed: `random`, `now`, `log`, `signal`.
- No storage.
- No package files.
- No saved data (`ctx.annex`) — a task is pure.
- No network.

## Kind: query

A node that reads. Yours reads your plugin's own storage; Serene Pub's data reaches it on its input ports, from core's queries.

- Handed: `random`, `now`, `log`, `storage`, `package`, `annex`, `signal`.
- Storage: your plugin's own files, when it asks for storage (`permissions.storage`).
- Package files: read-only, the files your plugin ships under `assets: { dir }` (`ctx.package.read`).
- The person's saved data: `ctx.annex('user')`, when your plugin holds `applet:annex:user` and your own applet is open (a person's request or press in its mounted frame caused the call); an event or lifecycle hook, the schedule tick and a routine run find it closed, and its methods reject.
- No network.

## Kind: oracle

The one node kind that calls out: the network, through the hosts your plugin declares. Never a model: model calls are core's nodes.

- Handed: `random`, `now`, `log`, `storage`, `package`, `annex`, `fetch`, `signal`.
- Storage: your plugin's own files, when it asks for storage (`permissions.storage`).
- Package files: read-only, the files your plugin ships under `assets: { dir }` (`ctx.package.read`).
- The person's saved data: `ctx.annex('user')`, when your plugin holds `applet:annex:user` and your own applet is open (a person's request or press in its mounted frame caused the call); an event or lifecycle hook, the schedule tick and a routine run find it closed, and its methods reject.
- Network: only the hosts your plugin declares (`permissions.network.hosts`) and an admin left allowed.

## Kind: outlet

A node that writes. Yours declares `effects: 'emit'`: it writes your own storage and passes values on, and core's outlets write to the session.

- Handed: `random`, `now`, `log`, `storage`, `package`, `annex`, `signal`.
- Storage: your plugin's own files, when it asks for storage (`permissions.storage`).
- Package files: read-only, the files your plugin ships under `assets: { dir }` (`ctx.package.read`).
- The person's saved data: `ctx.annex('user')`, when your plugin holds `applet:annex:user` and your own applet is open (a person's request or press in its mounted frame caused the call); an event or lifecycle hook, the schedule tick and a routine run find it closed, and its methods reject.
- No network.

## Kind: chain-link

A link in a script chain: text in, text out.

- Handed: `random`, `now`, `log`, `signal`.
- No storage.
- No package files.
- No saved data (`ctx.annex`) — a task is pure.
- No network.

## Kind: event

An event listener: runs when a session event happens.

- Handed: `random`, `now`, `log`, `storage`, `package`, `annex`, `signal`.
- Storage: your plugin's own files, when it asks for storage (`permissions.storage`).
- Package files: read-only, the files your plugin ships under `assets: { dir }` (`ctx.package.read`).
- The person's saved data: `ctx.annex('user')`, when your plugin holds `applet:annex:user` and your own applet is open (a person's request or press in its mounted frame caused the call); an event or lifecycle hook, the schedule tick and a routine run find it closed, and its methods reject.
- No network.

## Kind: lifecycle

A lifecycle callback: runs at startup, enable, disable, update, uninstall or shutdown.

- Handed: `random`, `now`, `log`, `storage`, `package`, `annex`, `signal`.
- Storage: your plugin's own files, when it asks for storage (`permissions.storage`).
- Package files: read-only, the files your plugin ships under `assets: { dir }` (`ctx.package.read`).
- The person's saved data: `ctx.annex('user')`, when your plugin holds `applet:annex:user` and your own applet is open (a person's request or press in its mounted frame caused the call); an event or lifecycle hook, the schedule tick and a routine run find it closed, and its methods reject.
- No network.

## Permission groups

A package asks for permissions in three groups, and the admin reviews and grants each group on its own. A grant is always bounded by the person acting.

- **In a session** (`permissions.session`, or a widget's `scopes`): what a frame may do in the session it is mounted in.
- **Outside a session, its applet** (`permissions.applet`, `permissions.storage.perUser`): what the package's applet may do with the person's library. A widget declaration may never ask for these, and `applet.sessions.genres` may name only the package's own genres.
- **On this pub** (`permissions.storage`, `network`, `media`): the sandbox's own reach.

| Key | Group | What it grants | Declared as |
|---|---|---|---|
| `widget:<scope>` | session | A frame's data request in the session it is mounted in (`session:state`, `lore`, a channel…). | a widget's `scopes`, or `permissions.session.scopes` |
| `widget:<scope>:write` | session | A write grant, reviewed apart from the read it never implies. | `'session:state:write'`, `'channel:<slug>:write'` in the same `scopes` |
| `event:<name>` | session | Hearing a session event, or running a pipeline on it. | an event listener, or a pipeline `input.event` |
| `applet:characters:read|write` | applet | The person's characters: list and read, or also create and change (write holds read). | `permissions.applet.characters` |
| `applet:lorebooks:read|write` | applet | The person's lorebooks: read, or also create, import and attach (write holds read). | `permissions.applet.lorebooks` |
| `applet:sessions:<genre id>` | applet | The person's sessions of that one genre of this package: list, open, start, update, delete. | `permissions.applet.sessions.genres` (own genres only) |
| `applet:annex:user` | applet | The person's user annex under the plugin's own name. | `permissions.applet.annex.user` |
| `storage-per-user[:<bytes>]` | applet | A private folder for each person, with an optional quota each. | `permissions.storage.perUser` |
| `storage[:<bytes>]` | system | The plugin's own pub-wide files, with an optional quota. | `permissions.storage` |
| `storage-serve:<glob>` | system | Serving matching own files to its own frames, read-only. | `permissions.storage.serve` |
| `network:<host>` | system | Fetching that host. | `permissions.network.hosts` |
| `media:autoplay` | system | Frames starting sound after the person's first gesture. | `permissions.media.autoplay` |
| `resource:<name>` | system | A named resource the sandbox reads. | a sandbox manifest |

## Rules for every kind

### Connections

**Plugins never touch a connection.** A plugin's code never reads connection data or calls a model; model calls are core's nodes. It may know only which capabilities are available. A node that uses a connection takes only core's stand-ins: shape it with your own prompts or a config instead.

### Private nodes

**A node is as public as its handler.** `handler(definition, fn, { visibility: 'public' })` makes a node usable by any package's pipeline, or by one a person makes; private is the default. A definition never says `public` itself. A swap contribution must be public: it runs your node in another package's pipeline. Refused at build, install, publish and run.

### Secrets

**Secrets are handles.** A `secret` setting reaches your code as a handle (`⟦secret:<key>:<nonce>⟧`), never its value; `ctx.fetch` fills the value in for your declared hosts only, an echoed or quoted key comes back as the handle, and anything you return, throw, log or store is scrubbed of it. When your node or tool runs in a pipeline another package owns, or one a person made, only the secrets you mark `lend: true` go with it.

### Events

**Events are caused by writes.** No node emits an event or starts a pipeline. A package records its own declared event with the `record-event` write, within the scope its entry declares, and everything in the session hears it.

### Widget writes

**A widget writes only behind a write grant.** A widget's scope lets it read (`session:state`, reviewed as `widget:session:state`); changing what the scope covers is a separate **write grant**, asked for in the same `scopes` and reviewed on its own: `session:state:write` lets it ask `set-attribute-value`, and `channel:<slug>:write` lets it ask `send` and `draft` on that channel, which it must also list in its `channels`. Holding the write never grants the read. Each write goes in as the viewer, only while a person is pressing in the widget, and with the viewer's own permissions. Every other change a widget wants goes through its plugin's own actions.
