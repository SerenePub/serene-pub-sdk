/**
 * `@serene-pub/core-catalog/session-state` — the plain-TypeScript half of
 * core's two state widgets, World State and Stats (R21): when a number is a
 * bar, what a value reads as, and what each widget draws from the
 * `session_state` section and its settings. Their Svelte source lives in
 * `components/sessions/{world-state,stats,state}/` and ships built
 * (`dist/components/world-state.js`, `dist/components/stats.js`); a host
 * imports only this half, which carries no Svelte runtime.
 *
 * 🚧 Provisional with the section (`SessionStateV1`).
 */
export * from './barMath.js';
export * from './stateView.js';
export * from './shapes.js';
//# sourceMappingURL=index.d.ts.map