/**
 * `@serene-pub/core-catalog/session-state` — the plain-TypeScript half of
 * core's state widget, Stats (R21; World State is Stats since W7, an alias):
 * when a number is a bar, what a value reads as, and what the widget draws
 * from the `session_state` section and its settings. Its Svelte source lives
 * in `components/shared/{stats,state}/` and ships built
 * (`dist/components/stats.js`; ⏳ `world-state.js` is the same module under
 * World State's slug); a host imports only this half, which carries no
 * Svelte runtime.
 *
 * 🚧 Provisional with the section (`SessionStateV1`).
 */
export * from './barMath.js'
export * from './stateView.js'
export * from './shapes.js'
export * from './timeFormat.js'
export * from './pieces.js'
