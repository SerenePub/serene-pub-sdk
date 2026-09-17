/** The one id every default session carries (was the create spec's slug). */
export declare const CHAT_GENRE_ID = "core:genre/chat";
export declare const chatGenre: import("@serene-pub/sdk").GenreDecl;
/**
 * The flagship genre (DESIGN-adventure-genre.md): chat with a **narrator who
 * plans, a cast who speak for themselves, and a state-keeper who writes the
 * numbers down.** Four agents, one turn, one receipt.
 *
 * The one-LLM-call rule is Chat's, not this one's. Everything a player sees on
 * screen — bars, inventory, the world strip, the ledger under a reply — is a
 * consequence of the state-keeper's proposals, never of prose parsing.
 */
export declare const ADVENTURE_GENRE_ID = "core:genre/adventure";
export declare const adventureGenre: import("@serene-pub/sdk").GenreDecl;
/**
 * The **pure user/assistant session type** (plans/29 R-18; 09-B B10; built
 * 2026-09-16 as U5g): one envoy, no characters, at most one persona. A
 * person talks; Serene Pub's guide answers about the app and its docs. It
 * is the structural successor of the deprecated *Assistant Chat*, whose code
 * is not reused — an envoy is a cast member, so the reply road, the turn
 * strategies, the resolver and the inspector all work unchanged.
 *
 * ⏳ The mascot is named plainly "Guide" and wears a placeholder glyph: its
 * name and art are the project owner's to set. Neither is load-bearing —
 * the key `mascot` is the address, and the name and image are display text.
 */
export declare const GUIDE_GENRE_ID = "core:genre/guide";
/** The guide's key — the slug `envoy:mascot` and the config address `envoy:mascot`. */
export declare const GUIDE_MASCOT_KEY = "mascot";
export declare const GUIDE_MASCOT_SYSTEM_PROMPT: string;
export declare const guideGenre: import("@serene-pub/sdk").GenreDecl;
//# sourceMappingURL=genres.d.ts.map