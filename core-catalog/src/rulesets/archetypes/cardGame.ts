/** 🚧 **Card game** archetype: a deck on the world, a hand per player, a discard (the zone types core's deck function adds); draw, play, score; a round ends as hands empty. */
import { defineRulesetTemplate, TURN_ENDED_EVENT, type FunctionDecl } from "@serene-pub/sdk"
import { BASICS_JS, body } from "../../functions/index.js"
import { ARCHETYPE_FUNCTIONS as F, row } from "./functionIds.js"

/** @experimental */
export const CARD_GAME_ID = "core:ruleset/template-card-game@1"

/** The module the card game carries: a hand empty at the end of its holder's turn ends their round. */
const roundOver: FunctionDecl = {
	id: "core:function/template-card-game-round-over@1", name: { en: "The round is over" }, kind: "time", phases: ["effects"],
	meaning: { en: "When a player's hand is empty at the end of their turn, the round is over for them." },
	bindings: { hand: { to: "zone-type", label: { en: "Hand" } } },
	prose: "A round ends as the hands run out: a player with no cards left waits for the next deal.",
	body: body(BASICS_JS, `export function effects(input) {
	var ev = input.event, hand = zoneOf((input.bindings || {}).hand);
	if (!ev || ev.id !== "${TURN_ENDED_EVENT}" || !hand || (hand.entries || []).length) return {};
	return { lines: [((input.owner && input.owner.name) || "They") + " has no cards left: the round is over."] };
}`)
}

/** 🚧 @experimental */
export const cardGameTemplate = defineRulesetTemplate(CARD_GAME_ID, {
	label: { en: "Card game" },
	about: { en: "A deck the table shares, a hand each, a discard pile. Draw, play, score; a round ends when the hands are empty." },
	goodFor: { en: "Parlour games, gambling dens and tournaments, where the cards on the table are the story." },
	ruleset: {
		template: true,
		name: { en: "Card game" },
		description: { en: "A shared deck, a hand each, a discard and a score." },
		attributes: [{ id: "score", name: { en: "Score" }, kind: "tally", bounds: { min: 0 }, start: 0, carriedBy: ["cast"], shownAs: "count", changedBy: ["rules"], prose: "Score: points a player has taken this game. It only goes up, and the highest at the end wins." }],
		entryTypes: [{ id: "card", name: { en: "Card" }, holders: ["cast", "world"], tags: ["card"], prose: "Cards: what the game is played with. Each has a suit and a rank, and is worth its rank in points when taken.", fields: { suit: { type: "enum", of: ["hearts", "spades", "clubs", "diamonds"], default: "hearts", label: { en: "Suit" }, description: { en: "Which of the four suits it belongs to." } }, rank: { type: "integer", default: 1, label: { en: "Rank" }, description: { en: "1 to 13; also its points." } } } }],
		functions: [
			{ ref: F.deck, key: "draw-up", bindings: { deck: "deck", hand: "hand" }, options: { draws: 1 } },
			{ ref: F.moveEntry, key: "play-card", bindings: { from: "hand", to: "discard" } },
			{ ref: F.markTally, key: "take-points", bindings: { tally: "score" } },
			{ ref: roundOver.id, key: "round-over", bindings: { hand: "hand" }, module: roundOver }
		],
		outcomes: [
			{ id: "lost", label: { en: "Trick lost" }, five: "fail" },
			{ id: "tied", label: { en: "Tied" }, five: "partial" },
			{ id: "won", label: { en: "Trick won" }, five: "success" }
		],
		library: { source: { document: "Card game archetype (Serene Pub)", licence: "Apache-2.0" }, rows: { card: [row("queen-hearts", { name: "Queen of hearts", description: "Worth a lot, and knows it.", suit: "hearts", rank: 12 }), row("two-spades", { name: "Two of spades", description: "A small card for a small trick.", suit: "spades", rank: 2 }), row("ace-clubs", { name: "Ace of clubs", description: "High or low, depending on who is asking.", suit: "clubs", rank: 1 })] } }
	},
	playtest: {
		party: [{ name: "Ada", stats: { score: 4 }, pieces: { card: ["queen-hearts", "two-spades"] } }, { name: "Bex", stats: { score: 6 }, pieces: { card: ["ace-clubs"] } }],
		situation: { en: "Last cards of the round. Ada leads with her queen; Bex has one card left." },
		change: { owner: "Ada", op: "use", check: "play-card", repertoire: "card", piece: "queen-hearts", aimedAt: "Bex" }
	}
})
