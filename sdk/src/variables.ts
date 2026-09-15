/**
 * Context variables as an open registry (F2 — ids namespaced, `core:` reserved).
 *
 * ## The inversion this exists to make
 *
 * A context template today writes `{{{characters}}}` and gets back a blob of
 * JSON whose shape was decided in TypeScript — indentation and all. Which means
 * "I want my characters rendered as prose instead of JSON" is not a
 * configuration question at all; it is a code change. The template can decide
 * *whether* characters appear and *where*, and has no say whatsoever in what
 * they look like when they do.
 *
 * A variable declaration moves that decision into data. The producing node says
 * "this slot renders `core:var/characters@1`", the registry says what is in
 * scope when it renders and what a representative value looks like, and the
 * actual presentation becomes a swappable row the same way a prompt is.
 *
 * ## Why `scope` is on the declaration and not inferred
 *
 * This is the same argument `SlotDecl.variables` makes for source templates and
 * for the same reason (see descriptors.ts): the shape an author needs to write
 * against lives *inside* a payload, not on a port. Typed ports can say a node
 * emits `core:shape/json@1`; they cannot tell whoever is writing
 * `{{#each characters}}{{ this.nickname }}` whether `nickname` is a field.
 * Declaring it is what makes lint and autocomplete possible at all, and it is
 * the "pass expected shapes down to the configuration" half of the feature.
 *
 * `sample` is the other half. A preview that renders against real chat data
 * needs a chat; a preview that renders against a declared sample needs nothing,
 * which is what lets the template editor show output while you type.
 */

import type { I18n } from './descriptors.js'
import { checkScopeSample, type TemplateScope, type VarField } from './template.js'
import { refuseUnlessIdentical } from './hash.js'

/** `core:var/characters@1` — namespaced and versioned like every other id. */
export type VariableId = string

export interface VariableDecl {
	id: VariableId
	i18n?: { name?: I18n; description?: I18n }
	/**
	 * What this variable is, shown where it is selected. Display text: stripped
	 * from any content hash for the same reason `i18n` is.
	 */
	description?: I18n
	/**
	 * What is in the root of a template rendering this variable.
	 *
	 * Normally one entry named for the variable itself — `{ characters: 'any' }`
	 * — but nothing requires that, and a variable whose presentation depends on
	 * a second value declares both.
	 */
	scope: TemplateScope
	/** A representative value, for previews and publish-time checking. */
	sample: unknown
}

const variables = new Map<VariableId, VariableDecl>()

/**
 * Register a variable declaration.
 *
 * Two refusals, both the same rule the engine and renderer registries enforce:
 * an id has exactly one owner, and `core:` is not for the taking. A plugin that
 * could redefine `core:var/characters@1` would change how characters render in
 * every pipeline on the instance without appearing in a single spec — invisible
 * in exactly the way a prompt change is not.
 */
export function defineVariable(decl: VariableDecl): VariableDecl {
	const existing = variables.get(decl.id)
	if (existing) refuseUnlessIdentical(existing, decl, `duplicate variable id: ${decl.id}`)
	variables.set(decl.id, decl)
	return decl
}

/**
 * The plugin-facing door. Same registration, minus the ability to claim core's
 * namespace — checked here rather than in `defineVariable` so core's own
 * declarations do not have to argue their way past their own guard.
 */
export function definePluginVariable(pluginId: string, decl: VariableDecl): VariableDecl {
	if (decl.id.startsWith('core:'))
		throw new Error(
			`plugin '${pluginId}' may not declare '${decl.id}': the 'core:' namespace is ` +
				`reserved. Publish it under your own namespace — a variable two parties can ` +
				`define is one where every template renders differently depending on load order.`,
		)
	return defineVariable(decl)
}

export const getVariable = (id: VariableId) => variables.get(id)
export const allVariables = () => [...variables.values()]
export function _clearVariables(): void {
	variables.clear()
}

// ── Core's variables ────────────────────────────────────────────────────────
//
// One per top-level value a context template renders. Declared here rather than
// in the host so that `slots.renders` in the contracts package can name them,
// and so a plugin reading the registry sees core's on the same terms as its own.

/**
 * One character card, as `compileCharacter` actually builds it.
 *
 * ⚠ Two of the six field names this variable declared before schemas existed
 * were wrong, and both were wrong in the direction that hurts: they named
 * fields a layout author could write and get nothing back from.
 *
 * - **`lore` does not exist. The key is `"extra lore"`, with the space.**
 *   `attachCharacterLoreToCharacters` spreads the card and adds that literal
 *   key; nothing anywhere writes `lore`. A layout reaching for `this.lore`
 *   rendered empty, and empty is indistinguishable from "this character has no
 *   bound lore" — so the bug looked like data every time.
 * - **`exampleDialogue` is not on the card at all.** It is a top-level variable
 *   (`core:var/example-dialogue@1`) resolved from the *speaking* character, and
 *   `compileCharacter` never puts it on a card. Declaring it here promised a
 *   per-character field that has never existed.
 *
 * Everything but `name` is optional because `compileCharacter` deletes any key
 * that came back null or undefined — deliberately, since these cards are
 * stringified into the prompt and a `"personality": null` is a line the model
 * reads. `personality` is also absent for any character shown at MINIMAL
 * visibility, which is the whole point of that visibility.
 */
const CHARACTER_CARD: VarField = {
	type: 'object',
	fields: {
		name: { type: 'string', description: { en: 'What the character is called in the prompt.' } },
		nickname: {
			type: 'string',
			optional: true,
			description: { en: 'Their short name, when they have one.' },
		},
		description: {
			type: 'string',
			optional: true,
			description: { en: 'Who they are.' },
		},
		personality: {
			type: 'string',
			optional: true,
			description: { en: 'How they behave. Absent for a character shown at minimal visibility.' },
		},
		'extra lore': {
			type: 'record',
			of: { type: 'string' },
			optional: true,
			description: {
				en: 'Lore bound to this character that fit the budget, keyed by entry name. Write it as {{ this.[extra lore] }} — the key has a space in it.',
			},
		},
	},
}

const ash = {
	name: 'Ash',
	nickname: 'Ash',
	description: 'A rider who patrols the ash wastes.',
	personality: 'Terse, loyal, slow to trust.',
	'extra lore': { 'The Ashguard brand': 'Carries a brand from the Ashguard.' },
}

// No nickname, no bound lore. A sample where every row is fully populated
// teaches an author that every row will be, and the optional fields here are
// the ones a real cast drops most often.
const brannoc = {
	name: 'Brannoc',
	description: 'A caravan master who has crossed the wastes eleven times.',
	personality: 'Genial, and counting.',
}

export const varInstructions = defineVariable({
	id: 'core:var/instructions@1',
	i18n: { name: { en: 'Instructions' } },
	description: {
		en: 'The system instructions for the reply, after macros are substituted.',
	},
	scope: { instructions: { type: 'string' } },
	// Already interpolated, because that is how it arrives: macros expand
	// upstream, and a sample still carrying `{{char}}` would read as a preview
	// showing that macros do not work.
	sample: 'You are Ash. Stay in character and never speak for Rell.',
})

export const varCharacters = defineVariable({
	id: 'core:var/characters@1',
	i18n: { name: { en: 'Characters' } },
	description: {
		en: 'Everyone in the scene except the user, with their descriptions and any lore attached to them.',
	},
	scope: { characters: { type: 'list', of: CHARACTER_CARD } },
	sample: [ash, brannoc],
})

export const varPersonas = defineVariable({
	id: 'core:var/personas@1',
	i18n: { name: { en: 'Personas' } },
	// Two fields, and that is not an oversight — see the note in
	// templateContext.ts. Persona lore never attaches on any live path, so a
	// template promising `{{ this.[extra lore] }}` here would render nothing and
	// read as a template bug rather than as the upstream one it is.
	//
	// `description` is optional for a different reason than a character's is:
	// personas are built by hand in `resolveContextInput` and never go through
	// `compileCharacter`, so nothing strips a null. The key is always present
	// and its value can be null, which a template cannot tell from absent.
	description: { en: 'Who the user is playing, as the prompt sees them.' },
	scope: {
		personas: {
			type: 'list',
			of: {
				type: 'object',
				fields: {
					name: { type: 'string' },
					description: { type: 'string', optional: true },
				},
			},
		},
	},
	sample: [{ name: 'Rell', description: 'A cartographer looking for a way north.' }],
})

export const varScenario = defineVariable({
	id: 'core:var/scenario@1',
	i18n: { name: { en: 'Scenario' } },
	description: { en: 'The situation the scene opens in.' },
	scope: { scenario: { type: 'string' } },
	sample: 'The caravan has stopped at the edge of the wastes.',
})

export const varExampleDialogue = defineVariable({
	id: 'core:var/example-dialogue@1',
	i18n: { name: { en: 'Example dialogue' } },
	description: { en: 'Sample exchanges that show the model how the characters speak.' },
	scope: { exampleDialogue: { type: 'string' } },
	// Interpolated, like `instructions` — the speaker's name is already
	// substituted by the time a layout sees this.
	sample: 'Ash: "Ash in the water again."',
})

export const varPostHistoryInstructions = defineVariable({
	id: 'core:var/post-history-instructions@1',
	i18n: { name: { en: 'Post-history instructions' } },
	description: {
		en: 'The reminder placed next to the generation point, after the conversation.',
	},
	scope: { postHistoryInstructions: { type: 'string' } },
	sample: 'Stay in character and write one paragraph.',
})

export const varCharacterNames = defineVariable({
	id: 'core:var/character-names@1',
	i18n: { name: { en: 'Character names' } },
	description: { en: 'Just the names of the characters in the scene.' },
	// A **string**, not a list. `joinWithAnd` runs upstream, so what a layout
	// receives is already "Ash and Brannoc" — and declaring it as a list would
	// be the same class of lie the hand-written preview data used to tell about
	// `worldLore`: a template written against it looks right in the editor and
	// renders wrong in a chat. Saying `type: 'string'` is the first time the
	// declaration has been able to state this rather than leave it to a comment.
	scope: { characterNames: { type: 'string' } },
	sample: 'Ash and Brannoc',
})

export const varPersonaNames = defineVariable({
	id: 'core:var/persona-names@1',
	i18n: { name: { en: 'Persona names' } },
	description: { en: "Just the names of the user's personas in the scene." },
	scope: { personaNames: { type: 'string' } },
	sample: 'Rell',
})

// ── Produced during assembly ────────────────────────────────────────────────
//
// These three come out the other side of the budget, so what reaches a layout
// is what actually *fit* — the entries allocation kept, not everything
// retrieval found. That is the reason they are declared at Assemble rather than
// alongside the cast: no earlier node knows the answer.
//
// Note what is *not* here. `characterLore` is a top-level value on the assembly
// context and no template renders it: qualifying entries are folded into their
// bound character's own object under an `"extra lore"` key inside `characters`
// (docs/context-configs.md is explicit about it). Declaring a layout for it
// would offer a setting that changes nothing, which is worse than the vestigial
// array it would be configuring.

export const varWorldLore = defineVariable({
	id: 'core:var/world-lore@1',
	i18n: { name: { en: 'World lore' } },
	description: {
		en: 'Lorebook entries about the world that fit the budget, keyed by entry name.',
	},
	// `'any'` could not say this, and the shape it could not say is exactly the
	// one a hand-written preview got wrong once already.
	scope: { worldLore: { type: 'record', of: { type: 'string' } } },
	sample: {
		'The Ashguard': 'Riders who patrol the ash wastes.',
		'The Long Winter': 'Nine years without a thaw.',
	},
})

export const varHistory = defineVariable({
	id: 'core:var/history@1',
	// "Story history" until 0.6. It is a *list of dated history entries*, and
	// calling it a story invited people to look for the story — the summary of
	// the chat so far, which is a different feature that does not exist here.
	i18n: { name: { en: 'History entries' } },
	description: {
		en: 'Earlier events from the chat that fit the budget, newest first, keyed by date.',
	},
	scope: { history: { type: 'record', of: { type: 'string' } } },
	sample: {
		'Year 412, Month 3': 'The caravan reached the wastes.',
		'Year 412, Month 1': 'Ash left the Ashguard.',
	},
})

/** One relationship as the prompt sees it — `relEntry` in graphContextFormatter. */
const RELATIONSHIP: VarField = {
	type: 'object',
	fields: {
		type: { type: 'string', description: { en: 'What the relationship is.' } },
		secrecy: {
			type: 'string',
			description: { en: 'Who knows about it — "Only I know", "We both know", and so on.' },
		},
		status: {
			type: 'string',
			optional: true,
			description: { en: 'Only present when it is something other than active.' },
		},
		theirState: {
			type: 'string',
			optional: true,
			description: { en: "The other party's node state, when it is not active." },
		},
		note: { type: 'string', optional: true, description: { en: 'The written detail.' } },
	},
}

/** Relationships grouped under the *other* party's name. */
const BY_OTHER: VarField = { type: 'record', of: { type: 'list', of: RELATIONSHIP } }

/**
 * The speaker-centric relationship summary from the narrative graph.
 *
 * ⚠ This was declared `'any'` and carried a **pre-stringified string** —
 * `buildGraphContext` called `JSON.stringify(graph, null, 1)` before the value
 * ever reached a template, so the layout was a passthrough. That made it the
 * one context value a layout could do nothing with: not prose, not a dropped
 * section, not even a different indent, because the shape had already been
 * flattened upstream. The node now emits the structure and the layout does the
 * rendering, which is the same inversion `characters` got.
 *
 * All three sections are conditional. An install with no legendary figures has
 * no `legendaryFigures` key at all rather than an empty object, and the shipped
 * layout's guards are written against exactly that.
 *
 * Distinct from `narrativeGraph`, which the infill engines populated and which
 * nothing renders any more: this one is speaker-centric and always-on wherever
 * a chat has a lorebook and the speaker has a bound node.
 */
/**
 * How the speaking character regards everyone else.
 *
 * ⚠ Split, with its sibling below, out of `core:var/speaker-relationships@1`.
 * That one variable held both directions and the legendary figures under a
 * single "Your relationships:" heading — so a model was handed what the speaker
 * thinks of Brannoc and what Rell thinks of the speaker as one undifferentiated
 * list, and a user who wanted one and not the other had no setting for it. Two
 * variables means two layouts, two priorities and two switches.
 */
export const varRelationshipsPerspectives = defineVariable({
	id: 'core:var/relationships-perspectives@1',
	i18n: { name: { en: 'Relationships: their perspective' } },
	description: {
		en: 'How the speaking character regards each of the others, from the narrative graph.',
	},
	scope: {
		relationshipsPerspectives: {
			...BY_OTHER,
			description: { en: 'How the speaker regards each other character.' },
		},
	},
	sample: {
		Brannoc: [
			{
				type: 'wary respect',
				secrecy: 'Only I know',
				note: 'Ash has never forgotten who opened the lower gate.',
			},
		],
	},
})

/**
 * How everyone else regards the speaking character, and who the world knows of.
 *
 * `legendaryFigures` sits here rather than in its own variable because it is
 * the same kind of claim — what is publicly known — and the opposite kind from
 * "what you think of them". A third variable would put a mostly-empty block in
 * every prompt on every install that has never marked a node legendary.
 *
 * Both sections are conditional: an install with no legendary figures has no
 * `legendaryFigures` key at all rather than an empty object, and the shipped
 * layout's guards are written against exactly that.
 */
export const varRelationshipsKnown = defineVariable({
	id: 'core:var/relationships-known@1',
	i18n: { name: { en: 'Relationships: how others see them' } },
	description: {
		en: 'How the others regard the speaking character, plus any figures the world knows of.',
	},
	scope: {
		relationshipsKnown: {
			type: 'object',
			fields: {
				howOthersRegardYou: {
					...BY_OTHER,
					optional: true,
					description: { en: 'How each other character regards the speaker.' },
				},
				legendaryFigures: {
					type: 'record',
					optional: true,
					description: { en: 'Figures the world knows of, and their public relationships.' },
					of: {
						type: 'object',
						fields: {
							summary: { type: 'string', optional: true },
							state: { type: 'string', optional: true },
							relationships: { ...BY_OTHER, optional: true },
						},
					},
				},
			},
		},
	},
	sample: {
		howOthersRegardYou: {
			Rell: [
				{
					type: 'debt',
					secrecy: 'We both know',
					status: 'evolved',
					note: 'Rell owes Ash for the crossing.',
				},
			],
		},
	},
})

export const varCurrentDate = defineVariable({
	id: 'core:var/current-date@1',
	i18n: { name: { en: 'Current date' } },
	description: {
		en: "The story's present date, taken from the most recent history entry.",
	},
	/**
	 * ⚠ Was `{ currentDate: { type: 'string' } }` with the sample
	 * `'Year 412, Month 3'`, and the sample was **wrong** — the value arrived
	 * pre-formatted by `formatDate` as `412-03`, so the preview showed a
	 * rendering the prompt never contained. That is the failure mode a sample
	 * exists to prevent, and it happened because the shape was a finished
	 * string: nothing could disagree with the formatting, so nothing did.
	 *
	 * The parts travel separately now and the layout joins them, which is what
	 * makes "state the date differently" a setting rather than a code change.
	 * `month` and `day` are absent rather than null when the entry has no such
	 * precision — `{{#if (isSet …)}}` is what a layout tests.
	 */
	scope: {
		currentDate: {
			type: 'object',
			fields: {
				year: { type: 'number', description: { en: 'The story year.' } },
				month: {
					type: 'number',
					optional: true,
					description: { en: 'Absent when the entry is only dated to a year.' },
				},
				day: {
					type: 'number',
					optional: true,
					description: { en: 'Absent when the entry is only dated to a month.' },
				},
			},
		},
	},
	sample: { year: 412, month: 3, day: 5 },
})

// ── Samples ─────────────────────────────────────────────────────────────────

/**
 * A declaration's `sample`, spread across the keys of its `scope`.
 *
 * Nearly every variable declares a single-key scope named for itself, and its
 * `sample` is that key's value. A declaration with several keys has to supply
 * an object covering them, which is the only reading that lets a variable whose
 * presentation depends on a second value describe itself at all.
 *
 * This lives here rather than in the host because two things need it and they
 * must agree: the preview that renders a layout against the sample, and the
 * check that the sample matches the schema. A convention implemented twice is
 * one that eventually holds in one place and not the other, and the failure
 * would be a preview quietly rendering against `undefined`.
 */
export function sampleValues(decl: Pick<VariableDecl, 'scope' | 'sample'>): Record<string, unknown> {
	const keys = Object.keys(decl.scope)
	if (keys.length === 1) return { [keys[0]!]: decl.sample }
	const asRecord = (decl.sample ?? {}) as Record<string, unknown>
	return Object.fromEntries(keys.map((k) => [k, asRecord[k]]))
}

/**
 * Every declared variable whose sample does not match its own schema.
 *
 * Exported rather than left in the test because it is the same check a plugin's
 * variable needs at publish time, and because "the sample is a lie" is a defect
 * an installed plugin can carry just as easily as core can — as core did, in
 * two fields of one declaration, for the entire life of this registry.
 */
export function checkVariableSamples(decls: readonly VariableDecl[] = allVariables()): string[] {
	return decls.flatMap((d) => checkScopeSample(sampleValues(d), d.scope, d.id))
}
