/**
 * Core's narrator pipeline — a narration or environment turn.
 *
 * ## Why this is its own namespace rather than a flag on the reply pipeline
 *
 * Structurally it is the reply pipeline: same queries, same assembly, same
 * provider. Every difference is *configuration* — a different system prompt, a
 * different post-history reminder, a name on the line the model continues from,
 * and its own connection and sampling choices. That is precisely the set of
 * things a namespace holds, and `narrator_prompt_configs` is already that table
 * wearing a different name.
 *
 * A flag on the reply spec would have made the two share one config surface,
 * which is the thing a user configuring a narrator most needs them not to do:
 * the narrator's whole job is to *not* sound like the character reply that
 * shares its session.
 *
 * ## What it deliberately keeps
 *
 * Lorebook triggers, because a narrator describing a place needs the lore about
 * that place as much as a character does. Reading `generateResponse.ts` closely,
 * the thing narrator mode actually skips is **graph context** — which needs a
 * speaking character's perspective and a narrator has none — not retrieval. The
 * two are easy to conflate, and conflating them would quietly strip a narrator
 * of its world.
 *
 * ## Its sibling (ruling 2026-09-07)
 *
 * `core:spec/narrate-character` is the other half of the split: a turn spoken
 * by somebody who is not in the cast. This one narrates the **world** and
 * speaks as nobody; that one speaks **as a person** and is written from their
 * perspective. Both read world lore, and neither is inserted into the
 * round-robin — see `narrateCharacter.ts` for how that is a property of the
 * message row rather than a rule this file enforces.
 *
 * They stay two specs for the reason this file's opening argument gives about
 * the reply pipeline: the difference between them is entirely *configuration* —
 * a different system prompt, a different name on the seed line, a different
 * context builder declaring a different surface — and a namespace is what holds
 * that. A flag would have made one config surface serve a narrator and a
 * character, which is precisely what neither wants.
 */
/** @experimental */
export declare const NARRATE_SPEC_ID = "core:spec/narrate";
/** @internal */
export declare const NARRATE_VERSION = "1.11.0";
/** @experimental */
export declare const narrateSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=narrate.d.ts.map