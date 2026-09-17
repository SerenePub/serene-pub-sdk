/**
 * The built-in writes as specs (R-15, ruled 2026-09-15, built 2026-09-16).
 *
 * *Anything that alters message state is a built-in*: core implements the
 * write and it always emits an event carrying what changed and what was
 * lost. Each spec here is one such write — the request on
 * `core:inlet/built-in-request@1`, the write on its outlet, nothing between —
 * so that a delete is a **run**: receipted, gate-eligible (an admin may turn
 * review on for `delete-message`), and recorded in the session's changes for
 * the next reply's inlet. The venue's handler makes the permission checks
 * it alone can make and hands the request to `runBuiltIn` in core, which runs
 * the spec named here with a run kind of `action`; the host's commit re-runs
 * the item rule against the actor before it writes, and only these five
 * documents may place a built-in outlet at all (`validate()`, U5b review C1
 * and W8).
 *
 * ## Floors and opt-ins
 *
 * Stop, branch and edit are **floors** — present in every genre, never
 * switched off. Delete, hide (ghost) and swipe are built-ins a genre may
 * switch off through `SessionShape.messageVerbs`, never re-implement. Stop
 * has no spec: it is the run-level guarantee (R-17) and emits
 * `message-stopped` from the finalisation. Regenerate, continue and a
 * swipe's fresh alternative are the reply road's own `update-message` with a
 * `verb` on its event — content the genre's pipeline produced, written by the
 * outlet the reply already ends in.
 *
 * ## No lock, no genre
 *
 * A built-in serves every genre, so no inlet lock is declared and no
 * `taxonomy.genre` names one; `role: 'action'` because a person invokes it.
 * No `contributes.actions` either — core's message verbs are described once,
 * in the SDK's `CORE_ACTIONS` (30 §U5c): venue `message` (and `extra` for
 * retry/continue), audience `item`, the floors marked. A host merges that
 * table with the genre's `messageVerbs` availability; a spec here declaring
 * a second copy would be a second place for the same fact to drift.
 */
import { BUILTIN_SPEC_IDS, type BuiltInKind } from '@serene-pub/sdk';
export declare const BUILTIN_VERSION = "1.0.0";
export { BUILTIN_SPEC_IDS, type BuiltInKind };
export declare const BUILTIN_DELETE_SPEC_ID: "core:spec/builtin-delete";
export declare const BUILTIN_HIDE_SPEC_ID: "core:spec/builtin-hide";
export declare const BUILTIN_EDIT_SPEC_ID: "core:spec/builtin-edit";
export declare const BUILTIN_SWIPE_SPEC_ID: "core:spec/builtin-swipe";
export declare const BUILTIN_BRANCH_SPEC_ID: "core:spec/builtin-branch";
export declare const builtinDeleteSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const builtinHideSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const builtinEditSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const builtinSwipeSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const builtinBranchSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=builtins.d.ts.map