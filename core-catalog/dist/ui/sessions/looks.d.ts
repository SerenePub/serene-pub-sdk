/**
 * Core's **look** declarations — part of the announcement, the same as the
 * widgets and layouts beside them.
 *
 * A look is a declared layout variable at root, zone or unit scope. Seven of
 * them is the whole of core's layout vocabulary, and that is deliberate: the
 * model grows by somebody *declaring* a look rather than by this file learning
 * a key. A plugin ships its own under a namespaced key (`<pluginId>.key`) and
 * `resolve` reads both the same way.
 *
 * Four are **structural** — `resolve` reads their values to build the grid
 * templates. The other three are pass-through CSS variables for the host's
 * stylesheet: the host never interprets a backdrop, it just sets the variable
 * at the right scope and lets CSS do the rest. (`chrome` — card or bare — was
 * retired 2026-09-27 with the hidden v2 stage, its only reader.)
 *
 * ⚠ `backdrop` names an image by **media row id, never a URL**. The one is a
 * reference the media table owns and can revoke; the other is an unbounded
 * fetch from a person's layout document.
 */
import type { LookDecl } from '@serene-pub/sdk';
/** @experimental */
export declare const CORE_LOOKS: LookDecl[];
/** One look by key, for a caller holding a key that wants the declaration. @experimental */
export declare const coreLook: (key: string) => LookDecl | undefined;
//# sourceMappingURL=looks.d.ts.map