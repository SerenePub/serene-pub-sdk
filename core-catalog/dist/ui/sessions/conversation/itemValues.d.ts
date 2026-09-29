/**
 * The message venue's per-row published values — `item.<field>` (plans/29
 * R-15 *enabled-when*; plans/30 U5e, 2026-09-17).
 *
 * One pure shape both sides build: the server at the door from the real row
 * (`entities/publishedValues.ts`), the client per rendered row from what it
 * already knows (`messageVerbState.ts`). A field added here is added for
 * both, which is what lets a listing hand the client the `item.*` predicates
 * it could not evaluate without a message and trust the answer to match the
 * door's.
 */
/** The message venue's per-row facts, as `item.<field>`. @experimental */
export interface ItemValues {
    id: number;
    /** No later message on this channel — retry, extend and swipe act here only. */
    isNewest: boolean;
    hidden: boolean;
    generating: boolean;
    /** The row's `role` column: `user`, `assistant`, … */
    role: string;
    /** The item rule's answer for the viewer or actor (`canActOnMessage` / `canControl`). */
    mine: boolean;
    /**
     * A swipe to the right exists: a stored alternative after the one
     * showing, or — on a reply that is not a greeting — the fresh one the
     * reply road would write. A greeting's alternatives are its card's, so
     * on its last one there is nothing to swipe to.
     */
    hasSwipes: boolean;
    /** A card's greeting (`metadata.isGreeting`): swiped, never regenerated. */
    greeting: boolean;
    /**
     * Which channel the row is on (20 §7; R-C) — the stored string, lane
     * included. `main` for every row that names none, which is every row in
     * every session whose genre declares no channel of its own.
     *
     * Here because a genre with two channels has verbs that belong to one of
     * them: a writing room's *Rewrite* acts on the manuscript and must not be
     * offered on the conversation. `venue.channel` is the declared way to say
     * that and cannot be relied on yet — a listing is built for ONE channel
     * and the client asks for none — so an `item.channel` predicate is what
     * answers it per row, on both sides, from this one shape.
     */
    channel: string;
    /**
     * Who spoke the row, as a **participant reference** (lair re-plan R11,
     * 2026-09-28): `envoy:<slug>` for an envoy's line (the Lair's
     * Castellan), `character:<id>` for a character's line or a person's
     * persona line, and null for a person's persona-less line and for a
     * reply nobody in particular spoke (the pipeline's own voice). Read off
     * the row's columns and its `metadata.speaker`, never off a user id — a
     * widget is never sent one (`MESSAGE_HOST_FIELDS`), and this shape is
     * built on both sides.
     */
    speaker: string | null;
    /**
     * A character's line (R11): a reply (`role` is not `user`) whose
     * `speaker` is `character:<id>` — a cast member the story voices, never
     * the person's own line, even written as a persona, never an envoy's,
     * never the pipeline's own voice. Its own field because the predicate
     * grammar states one condition and never an *or* (`predicates.ts`):
     * "the person's line or the Castellan's" is exactly "not a character's
     * line", which is `item.characterLine equals false`.
     */
    characterLine: boolean;
}
/** What `itemValuesOf` reads off a row — the columns; the two facts only a query or a viewer answers ride beside. @experimental */
export interface ItemRow {
    id: number;
    isHidden?: boolean | null;
    isGenerating?: boolean | null;
    role?: string | null;
    /** The row's `channel` column; absent reads as `main`, the column's default. */
    channel?: string | null;
    /** The speaking character, when one spoke. */
    characterId?: number | null;
    /** The persona a person wrote the row as, when they held one. */
    personaId?: number | null;
    metadata?: {
        isGreeting?: boolean;
        swipes?: {
            currentIdx: number | null;
            history: string[];
        };
        /** The speaker an envoy's line records (`envoy:<slug>`); any other value is not read. */
        speaker?: unknown;
    } | null;
}
/**
 * Who spoke a row, as a participant reference — see `ItemValues.speaker`.
 * An envoy's reference wins (an envoy has no character row to name), then
 * the persona a person wrote as, then the speaking character.
 * @experimental
 */
export declare function itemSpeakerOf(row: Pick<ItemRow, 'characterId' | 'personaId' | 'metadata'>): string | null;
/** The `item` document for one message — pure, the same on both sides. @experimental */
export declare function itemValuesOf(row: ItemRow, facts: {
    isNewest: boolean;
    mine: boolean;
}): ItemValues;
//# sourceMappingURL=itemValues.d.ts.map