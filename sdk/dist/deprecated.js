/**
 * Deprecated aliases for the 2026-09-16 rename (plans/30 §U3; R-1, R-13, R-14).
 *
 * Every symbol here is the OLD spelling of something a **plugin author** may
 * have written against the previous SDK: the five node-definition declarers,
 * the registry readers, the two effectful ctx types, the script-kind declarers
 * and the three extension callables. They stay ONE release so an installed
 * plugin keeps loading and packaging; each says what replaced it, and none is
 * documented anywhere else.
 *
 * What is NOT here, on purpose: the host-facing spellings the app used
 * (`BuiltBlock`, `RoutePredicate`, `BLOCK_MODE_DECL`, `resolveBlockMode`,
 * `resolveDownstreamProvider`, `_clearTypes`, `_clearScriptTypes`,
 * `isScriptTypeId`/`parseScriptTypeId`/`getScriptType`/`allScriptTypes`) were
 * removed at the end of U3 phase 2 once the app's own rename landed. And the
 * builder verbs (`.input()`, `.provider()`, `.consume()`, `.async()`, `.map()`,
 * `.route()`, `.on()`) have no alias — they are methods, and the document
 * shape they compile to changed with them; a plugin's specs are rebuilt
 * against this release.
 *
 * ⚠ Removal is scheduled for the release after 0.6. Nothing new may be added
 * here. A new name is a new name.
 *
 * One field alias lives beside its declaration rather than here, on the same
 * one-release terms: `ActionDecl.function` (plans/31 V2, 2026-09-17) — the
 * key is the identity now, and `normalizeAction` reads a lone `function` as
 * the key and drops it otherwise.
 *
 * One consequence of the same change has no alias to give: since R-4 the
 * inlet lock is a pipeline's subscription, so the packager emits
 * `event:<inlet lock>` as a permission for every pipeline with an
 * `input.event` — not only for `.on()` subscriptions, which are gone. A
 * package rebuilt against this release lists one more permission than its
 * previous manifest did; that is the truth catching up, not a widening.
 */
import { describeInletDefinition, describeQueryDefinition, describeTaskDefinition, describeOracleDefinition, describeOutletDefinition, getDefinition, allDefinitions, } from './descriptors.js';
import { defineScriptKind, definePluginScriptKind, } from './scripts.js';
import { handler, handlersOf, lifecycleCallback, lifecycleCallbacksOf, eventListener, eventListenersOf, } from './extension.js';
// ── Definitions (was "types") ───────────────────────────────────────────────
/** @deprecated renamed `describeInletDefinition` (2026-09-16). @experimental */
export const describeInput = describeInletDefinition;
/** @deprecated renamed `describeQueryDefinition` (2026-09-16). @experimental */
export const describeQueryType = describeQueryDefinition;
/** @deprecated renamed `describeTaskDefinition` (2026-09-16). @experimental */
export const describeTaskType = describeTaskDefinition;
/** @deprecated renamed `describeOracleDefinition` (2026-09-16). @experimental */
export const describeProvider = describeOracleDefinition;
/** @deprecated renamed `describeOutletDefinition` (2026-09-16). @experimental */
export const describeConsumerTarget = describeOutletDefinition;
/** @deprecated renamed `getDefinition` (2026-09-16). @experimental */
export const getType = getDefinition;
/** @deprecated renamed `allDefinitions` (2026-09-16). @experimental */
export const allTypes = allDefinitions;
// ── Script kinds (was "script types") ───────────────────────────────────────
/** @deprecated renamed `defineScriptKind` (2026-09-16). @experimental */
export const defineScriptType = defineScriptKind;
/** @deprecated renamed `definePluginScriptKind` (2026-09-16). @experimental */
export const definePluginScriptType = definePluginScriptKind;
/** @deprecated renamed `handler()` (2026-09-16). @experimental */
export const pipelineHook = handler;
/** @deprecated renamed `handlersOf` (2026-09-16). @experimental */
export const pipelineHooksOf = handlersOf;
/** @deprecated renamed `lifecycleCallback()` (2026-09-16). @experimental */
export const lifecycleHook = lifecycleCallback;
/** @deprecated renamed `lifecycleCallbacksOf` (2026-09-16). @experimental */
export const lifecycleHooksOf = lifecycleCallbacksOf;
/** @deprecated renamed `eventListener()` (2026-09-16). @experimental */
export const eventHook = eventListener;
/** @deprecated renamed `eventListenersOf` (2026-09-16). @experimental */
export const eventHooksOf = eventListenersOf;
//# sourceMappingURL=deprecated.js.map