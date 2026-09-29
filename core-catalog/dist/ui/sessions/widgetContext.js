export { WIDGET_BASE_SECTIONS, WIDGET_SCOPED_SECTIONS, isWidgetScopedSectionName, } from '@serene-pub/sdk';
/**
 * 🚧 Did the host say this widget does NOT hold `scope`? True only once it
 * has said (`grants` present) — before that, an absent section is "not yet".
 * @experimental
 */
export const scopeNotGranted = (ctx, scope) => !!ctx?.grants && !ctx.grants.includes(scope);
/** The Svelte context key a core widget reads its context from. @experimental */
export const WIDGET_CONTEXT_KEY = 'widget';
//# sourceMappingURL=widgetContext.js.map