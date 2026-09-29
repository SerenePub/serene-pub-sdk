/**
 * A refusal's pointer to the plugin permissions guide (K1c) — its own module,
 * with one type-only import, so every refusal site (descriptors, the extension, the CLI) can
 * name a row without pulling the grant table in behind it.
 */
/** Where the guide lives, as a refusal sentence names it. @experimental */
export const PLUGIN_PERMISSIONS_GUIDE = 'guides/plugin-permissions.md';
/** ` (see guides/plugin-permissions.md#secrets)` — a row's anchor, as a refusal names it. @experimental */
export const pluginRuleRef = (anchor) => ` (see ${PLUGIN_PERMISSIONS_GUIDE}#${anchor})`;
//# sourceMappingURL=pluginRuleRef.js.map