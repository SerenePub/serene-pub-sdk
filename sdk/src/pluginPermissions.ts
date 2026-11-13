/**
 * What a plugin may do, by kind: one table, rendered from the grant
 * table the sandboxes enforce (`hookCtxKeysFor`) and the rulings every door
 * refuses on, so the guide cannot claim more or less than the code does.
 *
 * `guides/plugin-permissions.md` is this module's output (`renderPluginPermissionsGuide`),
 * held to it by a test, and every refusal that stems from a row names the
 * row's anchor (`pluginRuleRef`), each anchor held by a test to exist.
 *
 * ⚠ Not a **capability** — that is what a *connection* can do (`capabilities.ts`).
 * These are a plugin's **permissions**: what its sandboxed code may do (canon).
 * @ruling K1, R50
 */

import { HOOK_CTX_KINDS, hookCtxKeysFor, type HookCtxKind } from './hookGrants.js'
import { PLUGIN_PERMISSIONS_GUIDE, type PluginRule } from './pluginRuleRef.js'

export { PLUGIN_PERMISSIONS_GUIDE, pluginRuleRef, type PluginRule } from './pluginRuleRef.js'

/** The rules a refusal can point at, each a heading in the guide. @experimental */
export const PLUGIN_RULES: Record<PluginRule, { title: string; ruling: string; text: string }> = {
	connections: {
		title: 'Plugins never touch a connection',
		ruling: 'R53',
		text:
			"A plugin's code never reads connection data or calls a model; model calls are core's nodes. " +
			'It may know only which capabilities are available. A node that uses a connection takes only ' +
			"core's stand-ins: shape it with your own prompts or a config instead.",
	},
	'private-nodes': {
		title: 'A node is as public as its handler',
		ruling: 'R62',
		text:
			"`handler(definition, fn, { visibility: 'public' })` makes a node usable by any package's " +
			'pipeline, or by one a person makes; private is the default. A definition never says `public` ' +
			"itself. A swap contribution must be public: it runs your node in another package's pipeline. " +
			'Refused at build, install, publish and run.',
	},
	secrets: {
		title: 'Secrets are handles',
		ruling: 'R63',
		text:
			'A `secret` setting reaches your code as a handle (`⟦secret:<key>:<nonce>⟧`), never its value; ' +
			'`ctx.fetch` fills the value in for your declared hosts only, an echoed or quoted key comes back ' +
			'as the handle, and anything you return, throw, log or store is scrubbed of it. When your node ' +
			"or tool runs in a pipeline another package owns, or one a person made, only the secrets you " +
			'mark `lend: true` go with it.',
	},
	events: {
		title: 'Events are caused by writes',
		ruling: 'F8',
		text:
			'No node emits an event or starts a pipeline. A package records its own declared event with the ' +
			'`record-event` write, within the scope its entry declares, and everything in the session hears it.',
	},
	'widget-writes': {
		title: 'A widget writes only behind a write grant',
		ruling: 'Q2',
		text:
			"A widget's scope lets it read (`session:state`, reviewed as `widget:session:state`); changing what the " +
			'scope covers is a separate **write grant**, asked for in the same `scopes` and reviewed on its own: ' +
			'`session:state:write` lets it ask `set-attribute-value`, and `channel:<slug>:write` lets it ask `send` ' +
			"and `draft` on that channel, which it must also list in its `channels`. Holding the write never grants the " +
			"read. Each write goes in as the viewer, only while a person is pressing in the widget, and with the " +
			"viewer's own permissions. Every other change a widget wants goes through its plugin's own actions.",
	},
}

/** The anchor a kind's heading gets: `kind-oracle`. */
const kindAnchor = (kind: HookCtxKind) => `kind-${kind}` as const

/** What each kind's hook is, in a line — the one prose half the grant table cannot say. */
const KIND_ROLE: Record<HookCtxKind, string> = {
	task: 'A node that computes: data in, data out.',
	query: "A node that reads. Yours reads your plugin's own storage; Serene Pub's data reaches it on its input ports, from core's queries.",
	oracle: 'The one node kind that calls out: the network, through the hosts your plugin declares. Never a model: model calls are core\'s nodes.',
	outlet: "A node that writes. Yours declares `effects: 'emit'`: it writes your own storage and passes values on, and core's outlets write to the session.",
	'chain-link': 'A link in a script chain: text in, text out.',
	event: 'An event listener: runs when a session event happens.',
	lifecycle: 'A lifecycle callback: runs at startup, enable, disable, update, uninstall or shutdown.',
}

/** Every anchor a refusal may point at — each a heading the guide renders. @experimental */
export const PLUGIN_RULE_ANCHORS: readonly string[] = [
	...HOOK_CTX_KINDS.map(kindAnchor),
	...Object.keys(PLUGIN_RULES),
	'permission-groups',
]

/** ` (see guides/plugin-permissions.md#permission-groups)` — the groups section's pointer. 🚧 (M2b) @experimental */
export const permissionGroupsRef = (): string => ` (see ${PLUGIN_PERMISSIONS_GUIDE}#permission-groups)`

/**
 * 🚧 (M2b) The permission keys a package's manifest carries, by group: the rows of the
 * guide's key table (key · group · what it grants · declared as). One table, so the
 * guide and the admin's review list name the same keys.
 * @experimental
 */
export const PERMISSION_KEY_ROWS: ReadonlyArray<{
	key: string
	group: 'session' | 'applet' | 'system'
	grants: string
	declaredAs: string
}> = [
	{ key: 'widget:<scope>', group: 'session', grants: "A frame's data request in the session it is mounted in (`session:state`, `lore`, a channel…).", declaredAs: "a widget's `scopes`, or `permissions.session.scopes`" },
	{ key: 'widget:<scope>:write', group: 'session', grants: 'A write grant, reviewed apart from the read it never implies.', declaredAs: "`'session:state:write'`, `'channel:<slug>:write'` in the same `scopes`" },
	{ key: 'event:<name>', group: 'session', grants: 'Hearing a session event, or running a pipeline on it.', declaredAs: 'an event listener, or a pipeline `input.event`' },
	{ key: 'applet:characters:read|write', group: 'applet', grants: "The person's characters: list and read, or also create and change (write holds read).", declaredAs: "`permissions.applet.characters`" },
	{ key: 'applet:lorebooks:read|write', group: 'applet', grants: "The person's lorebooks: read, or also create, import and attach (write holds read).", declaredAs: "`permissions.applet.lorebooks`" },
	{ key: 'applet:sessions:<genre id>', group: 'applet', grants: "The person's sessions of that one genre of this package: list, open, start, update, delete.", declaredAs: '`permissions.applet.sessions.genres` (own genres only)' },
	{ key: 'applet:annex:user', group: 'applet', grants: "The person's user annex under the plugin's own name.", declaredAs: '`permissions.applet.annex.user`' },
	{ key: 'storage-per-user[:<bytes>]', group: 'applet', grants: 'A private folder for each person, with an optional quota each.', declaredAs: '`permissions.storage.perUser`' },
	{ key: 'storage[:<bytes>]', group: 'system', grants: "The plugin's own pub-wide files, with an optional quota.", declaredAs: '`permissions.storage`' },
	{ key: 'storage-serve:<glob>', group: 'system', grants: 'Serving matching own files to its own frames, read-only.', declaredAs: '`permissions.storage.serve`' },
	{ key: 'network:<host>', group: 'system', grants: 'Fetching that host.', declaredAs: '`permissions.network.hosts`' },
	{ key: 'media:autoplay', group: 'system', grants: "Frames starting sound after the person's first gesture.", declaredAs: '`permissions.media.autoplay`' },
	{ key: 'resource:<name>', group: 'system', grants: 'A named resource the sandbox reads.', declaredAs: 'a sandbox manifest' },
]

const code = (keys: readonly string[]) => keys.map((k) => `\`${k}\``)

/** The guide, rendered from the table. @internal */
export function renderPluginPermissionsGuide(): string {
	const lines: string[] = [
		'# What a plugin may do',
		'',
		"Your plugin's code runs in a sandbox, and what it may do depends on what kind of handler it is. " +
			'Each kind is handed a `ctx` with exactly these members and nothing else: `random`, `now`, `log` ' +
			"and `signal` are every kind's, and storage, package files, the person's saved data and network are granted by kind. This page is generated " +
			'from the table the sandboxes enforce, and a refusal names the section below that explains it. ' +
			'For what each part of a plugin is for, see [What a plugin can do](extending.md).',
		'',
		'<!-- Generated from the SDK (`renderPluginPermissionsGuide`, sdk/src/pluginPermissions.ts). Do not edit by hand. -->',
		'',
		'| Kind | Its `ctx` | What it is |',
		'|---|---|---|',
		...HOOK_CTX_KINDS.map((k) => `| [${k}](#${kindAnchor(k)}) | ${code(hookCtxKeysFor(k)).join(' · ')} | ${KIND_ROLE[k]} |`),
		'',
	]
	for (const k of HOOK_CTX_KINDS) {
		const keys = hookCtxKeysFor(k)
		lines.push(
			// GitHub's slug of "Kind: oracle" is `kind-oracle`, the anchor.
			`## Kind: ${k}`,
			'',
			KIND_ROLE[k],
			'',
			`- Handed: ${code(keys).join(', ')}.`,
			`- ${keys.includes('storage') ? "Storage: your plugin's own files, when it asks for storage (`permissions.storage`)." : 'No storage.'}`,
			`- ${keys.includes('package') ? "Package files: read-only, the files your plugin ships under `assets: { dir }` (`ctx.package.read`)." : 'No package files.'}`,
			`- ${keys.includes('annex') ? "The person's saved data: `ctx.annex('user')`, when your plugin holds `applet:annex:user` and your own applet is open (a person's request or press in its mounted frame caused the call); an event or lifecycle hook, the schedule tick and a routine run find it closed, and its methods reject." : "No saved data (`ctx.annex`) — a task is pure."}`,
			`- ${keys.includes('fetch') ? 'Network: only the hosts your plugin declares (`permissions.network.hosts`) and an admin left allowed.' : 'No network.'}`,
			'',
		)
	}
	lines.push(
		'## Permission groups',
		'',
		'A package asks for permissions in three groups, and the admin reviews and grants each group on its own. ' +
			'A grant is always bounded by the person acting.',
		'',
		'- **In a session** (`permissions.session`, or a widget\'s `scopes`): what a frame may do in the session it is mounted in.',
		'- **Outside a session, its applet** (`permissions.applet`, `permissions.storage.perUser`): what the package\'s applet may do with the person\'s library. A widget declaration may never ask for these, and `applet.sessions.genres` may name only the package\'s own genres.',
		'- **On this pub** (`permissions.storage`, `network`, `media`): the sandbox\'s own reach.',
		'',
		'| Key | Group | What it grants | Declared as |',
		'|---|---|---|---|',
		...PERMISSION_KEY_ROWS.map((r) => `| \`${r.key}\` | ${r.group} | ${r.grants} | ${r.declaredAs} |`),
		'',
	)
	lines.push('## Rules for every kind', '')
	// Each heading is its anchor in words — "Private nodes" slugs to
	// `private-nodes` — with the rule itself as the first line.
	for (const [anchor, rule] of Object.entries(PLUGIN_RULES))
		lines.push(
			`### ${anchor[0]!.toUpperCase()}${anchor.slice(1).replace(/-/g, ' ')}`,
			'',
			`**${rule.title}.** ${rule.text}`,
			'',
		)
	return lines.join('\n')
}
