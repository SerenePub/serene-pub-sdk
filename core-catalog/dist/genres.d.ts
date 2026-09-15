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
//# sourceMappingURL=genres.d.ts.map