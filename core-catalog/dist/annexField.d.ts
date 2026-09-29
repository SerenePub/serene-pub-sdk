/**
 * Core's one pipeline for every **annex field** (2026-09-26): a widget's
 * `invoke(annexFieldAction(owner, key), { payload: { value } })` runs this,
 * whichever package declared the field.
 *
 * It contributes no action. The host lists one action per declared field
 * (`<owner>:annex#<key>`), judges each press at its door — who may set it,
 * the plugin switch, the shape — and only then runs this spec with
 * `{ field, value }` on the inlet's `payload`. The outlet reads the
 * declaration again and writes through the annex write every
 * `set-session-annex` goes through.
 *
 * Locked to Chat only because an inlet names a genre: nothing binds it, and
 * the host runs it by id for a session of any genre.
 * @experimental
 */
import { type AnnexFieldDecl } from '@serene-pub/sdk';
/** @experimental */
export declare const SET_ANNEX_FIELD_SPEC_ID = "core:spec/set-annex-field";
/** @internal */
export declare const SET_ANNEX_FIELD_VERSION = "1.0.0";
/**
 * The Lair Castellan's scratchpad, as an annex key under `core` (lair re-plan
 * R13): see `CORE_ANNEX_FIELDS`. @experimental
 */
export declare const CASTELLAN_SCRATCHPAD_KEY = "castellan-scratchpad";
/** @experimental */
export declare const setAnnexFieldSpec: () => import("@serene-pub/sdk").SpecDocument;
/**
 * Core's **annex declaration** (owner ruling 2026-09-26): every key core
 * keeps in its own annex document (`annex.core`), declared once with its
 * shape and who may see it — the same declaration a package makes on
 * `defineExtension({ annexFields })`. A core genre's own keys are declared
 * here too, scoped with the field's `genre` option; `GenreDecl` does not
 * carry them.
 *
 * Two fields:
 *
 * - **`retake-quietly`** (owner ruling 2026-09-28, lair pass R2): the
 *   session owner's "Don't ask again for this session" on Regenerate the last
 *   turn (`core#retake`). It is a person's preference about one session, set
 *   by the person through the ready-made action (`core:annex#retake-quietly`),
 *   so it is the annex's by the ruling — not a column, and not a genre field,
 *   because retake is core and no genre owns it (no `genre` scope for the same
 *   reason).
 * - **`castellan-scratchpad`** (owner QB answer 2026-09-28, lair re-plan
 *   R13): the Lair Castellan's running notes — rooms it has planned with the
 *   Dungeon Master, intentions, corrections. The one key a core **pipeline**
 *   writes: `lair-respond` rewrites it after each Sanctum reply (the
 *   `channel.sanctum.notes.*` step). Its audience is the Castellan alone
 *   (`see: ['envoy:castellan']`), so it is hidden from every person's view and
 *   reaches no prompt but the Castellan's own — never a delver's (earshot by
 *   the audience model: the AI view keeps it only for that speaker). The
 *   owner may set it by hand (`act: ['owner']`, the Session data panel),
 *   and the Lair's sessions alone carry it (`genre`).
 *
 * Every other core pipeline keeps its state in core's own columns
 * (`sessions.metadata.turnOrder`, written by `set-turn-order`; each member's
 * composer text in `sessions.drafts`, written by the socket door).
 * `coreCatalog.test.ts` walks every core spec for a `set-session-annex` step
 * and holds each to this list, so a core writer added without its
 * declaration fails there before it ships.
 * @experimental
 */
export declare const CORE_ANNEX_FIELDS: readonly AnnexFieldDecl[];
//# sourceMappingURL=annexField.d.ts.map