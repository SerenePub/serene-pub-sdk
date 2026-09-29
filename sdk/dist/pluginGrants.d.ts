/**
 * What a plugin may do, by kind (K1, R50): one table, rendered from the grant
 * table the sandboxes enforce (`hookCtxKeysFor`) and the rulings every door
 * refuses on, so the guide cannot claim more or less than the code does.
 *
 * `guides/plugin-grants.md` is this module's output (`renderPluginGrantsGuide`),
 * held to it by a test, and every refusal that stems from a row names the
 * row's anchor (`pluginRuleRef`), each anchor held by a test to exist.
 *
 * ⚠ Not a **capability** — that is what a *connection* can do (`capabilities.ts`).
 * These are a plugin's grants and the rules around them.
 */
import type { PluginRule } from './pluginRuleRef.js';
export { PLUGIN_GRANTS_GUIDE, pluginRuleRef, type PluginRule } from './pluginRuleRef.js';
/** The rules a refusal can point at, each a heading in the guide. */
export declare const PLUGIN_RULES: Record<PluginRule, {
    title: string;
    ruling: string;
    text: string;
}>;
/** Every anchor a refusal may point at — each a heading the guide renders. */
export declare const PLUGIN_RULE_ANCHORS: readonly string[];
/** The guide, rendered from the table. */
export declare function renderPluginGrantsGuide(): string;
//# sourceMappingURL=pluginGrants.d.ts.map