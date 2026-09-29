/**
 * What a plugin may do, by kind (K1, R50): one table, rendered from the grant
 * table the sandboxes enforce (`hookCtxKeysFor`) and the rulings every door
 * refuses on, so the guide cannot claim more or less than the code does.
 *
 * `guides/plugin-permissions.md` is this module's output (`renderPluginPermissionsGuide`),
 * held to it by a test, and every refusal that stems from a row names the
 * row's anchor (`pluginRuleRef`), each anchor held by a test to exist.
 *
 * ⚠ Not a **capability** — that is what a *connection* can do (`capabilities.ts`).
 * These are a plugin's **permissions**: what its sandboxed code may do (canon).
 */
import { HOOK_CTX_KINDS, hookCtxKeysFor } from './hookGrants.js';
export { PLUGIN_PERMISSIONS_GUIDE, pluginRuleRef } from './pluginRuleRef.js';
/** The rules a refusal can point at, each a heading in the guide. @experimental */
export const PLUGIN_RULES = {
    connections: {
        title: 'Plugins never touch a connection',
        ruling: 'R53',
        text: "A plugin's code never reads connection data or calls a model; model calls are core's nodes. " +
            'It may know only which capabilities are available. A node that uses a connection takes only ' +
            "core's stand-ins: shape it with your own prompts or a config instead.",
    },
    'private-nodes': {
        title: 'A node is as public as its handler',
        ruling: 'R62',
        text: "`handler(definition, fn, { visibility: 'public' })` makes a node usable by any package's " +
            'pipeline, or by one a person makes; private is the default. A definition never says `public` ' +
            "itself. A swap contribution must be public: it runs your node in another package's pipeline. " +
            'Refused at build, install, publish and run.',
    },
    secrets: {
        title: 'Secrets are handles',
        ruling: 'R63',
        text: 'A `secret` setting reaches your code as a handle (`⟦secret:<key>:<nonce>⟧`), never its value; ' +
            '`ctx.fetch` fills the value in for your declared hosts only, an echoed or quoted key comes back ' +
            'as the handle, and anything you return, throw, log or store is scrubbed of it. When your node ' +
            "or tool runs in a pipeline another package owns, or one a person made, only the secrets you " +
            'mark `lend: true` go with it.',
    },
    events: {
        title: 'Events are caused by writes',
        ruling: 'F8',
        text: 'No node emits an event or starts a pipeline. A package records its own declared event with the ' +
            '`record-event` write, within the scope its entry declares, and everything in the session hears it.',
    },
};
/** The anchor a kind's heading gets: `kind-oracle`. */
const kindAnchor = (kind) => `kind-${kind}`;
/** What each kind's hook is, in a line — the one prose half the grant table cannot say. */
const KIND_ROLE = {
    task: 'A node that computes: data in, data out.',
    query: "A node that reads its package's own storage; Serene Pub's own data is read by core's query nodes.",
    oracle: 'The one node kind that calls out: the network, through the hosts your manifest declares.',
    outlet: "A node at the end of a pipeline that acts on the run's result.",
    'chain-link': 'A script link: text in, text out.',
    event: 'A listener for a session event.',
    lifecycle: 'Startup, enable, disable, update, uninstall, shutdown.',
};
/** Every anchor a refusal may point at — each a heading the guide renders. @experimental */
export const PLUGIN_RULE_ANCHORS = [
    ...HOOK_CTX_KINDS.map(kindAnchor),
    ...Object.keys(PLUGIN_RULES),
];
const code = (keys) => keys.map((k) => `\`${k}\``);
/** The guide, rendered from the table. @internal */
export function renderPluginPermissionsGuide() {
    const lines = [
        '# What a plugin may do',
        '',
        'Each kind of hook is handed a `ctx` with exactly these members and nothing else: the table is read ' +
            "from the one the sandboxes enforce. `random`, `now`, `log` and `signal` are every kind's. A " +
            'refusal that stems from a row below names the row.',
        '',
        '<!-- Generated from the SDK (`renderPluginPermissionsGuide`, sdk/src/pluginPermissions.ts). Do not edit by hand. -->',
        '',
        '| Kind | Its `ctx` | What it is |',
        '|---|---|---|',
        ...HOOK_CTX_KINDS.map((k) => `| [${k}](#${kindAnchor(k)}) | ${code(hookCtxKeysFor(k)).join(' · ')} | ${KIND_ROLE[k]} |`),
        '',
    ];
    for (const k of HOOK_CTX_KINDS) {
        const keys = hookCtxKeysFor(k);
        lines.push(
        // GitHub's slug of "Kind: oracle" is `kind-oracle`, the anchor.
        `## Kind: ${k}`, '', KIND_ROLE[k], '', `- Handed: ${code(keys).join(', ')}.`, `- ${keys.includes('storage') ? "Storage: its own package's rows and files, when its manifest declares the storage permission." : 'No storage.'}`, `- ${keys.includes('fetch') ? 'Network: only the hosts its manifest declares and an admin left allowed.' : 'No network.'}`, '');
    }
    lines.push('## Rules for every kind', '');
    // Each heading is its anchor in words — "Private nodes" slugs to
    // `private-nodes` — with the rule itself as the first line.
    for (const [anchor, rule] of Object.entries(PLUGIN_RULES))
        lines.push(`### ${anchor[0].toUpperCase()}${anchor.slice(1).replace(/-/g, ' ')}`, '', `**${rule.title}.** ${rule.text} (${rule.ruling})`, '');
    return lines.join('\n');
}
//# sourceMappingURL=pluginPermissions.js.map