/**
 * `@serene-pub/core-catalog/conversation` — the plain-TypeScript half of
 * core's conversation widget (C7): the dossier its host projects, and the
 * verdicts, ordering and text the widget draws from. The widget's Svelte
 * source lives in `components/sessions/messages/` and ships built
 * (`dist/components/messages.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * 🚧 Provisional with the dossier: a plugin is granted none of it, and
 * nothing here is part of the modder surface.
 */
export * from './dossier.js';
export * from './formAnswer.js';
export * from './itemValues.js';
export * from './messageOrder.js';
export * from './messageSpeaker.js';
export * from './messageVerbState.js';
export * from './slashPalette.js';
export * from './text.js';
export { WIDGET_CONTEXT_KEY, type WidgetContext, type WidgetContextRef } from '../widgetContext.js';
export * from './composerTray.js';
//# sourceMappingURL=index.d.ts.map