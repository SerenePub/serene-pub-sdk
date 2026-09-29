/**
 * A refusal's pointer to the plugin permissions guide (K1c) — its own module,
 * with one type-only import, so every refusal site (descriptors, the extension, the CLI) can
 * name a row without pulling the grant table in behind it.
 */
import type { HookCtxKind } from './hookGrants.js';
/** Where the guide lives, as a refusal sentence names it. @experimental */
export declare const PLUGIN_PERMISSIONS_GUIDE = "guides/plugin-permissions.md";
/** The rules a refusal can point at; each is a heading in the guide. @experimental */
export type PluginRule = 'connections' | 'private-nodes' | 'secrets' | 'events';
/** ` (see guides/plugin-permissions.md#secrets)` — a row's anchor, as a refusal names it. @experimental */
export declare const pluginRuleRef: (anchor: PluginRule | `kind-${HookCtxKind}`) => string;
//# sourceMappingURL=pluginRuleRef.d.ts.map