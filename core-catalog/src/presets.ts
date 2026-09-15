/**
 * Core's shipped session presets (24 T6b) — declared here, seeded by SP.
 *
 * The announcement carries the full `preset()` declaration (validated
 * against the genre's event surface like any package's); `CORE_PRESET_SEEDS`
 * is the same fact in the shape SP's seed pass writes, with the idempotence
 * keys existing installs already carry. The two are one list mapped, so they
 * cannot disagree.
 */
import { preset, sessionEvents, type PresetDecl } from "@serene-pub/sdk"
import { adventureGenre, chatGenre } from "./genres.js"
import { CREATE_CHAT_SPEC_ID } from "./createChat.js"
import { RESPOND_SPEC_ID } from "./respond.js"
import { NARRATE_SPEC_ID } from "./narrate.js"
import {
	ADVENTURE_CREATE_SPEC_ID,
	ADVENTURE_RESPOND_SPEC_ID
} from "./adventure.js"
import {
	ADVENTURE_ADVANCE_TIME_SPEC_ID,
	ADVENTURE_LOOK_SPEC_ID,
	ADVENTURE_REST_SPEC_ID
} from "./adventureActions.js"

export const chatDefaultPreset: PresetDecl = preset("chat-default", {
	genre: chatGenre,
	label: "Chat",
	description: "The standard roleplay chat, everything default.",
	bindings: {
		[sessionEvents.sessionCreated]: CREATE_CHAT_SPEC_ID,
		[sessionEvents.messageRespond]: RESPOND_SPEC_ID
	},
	actions: { include: [NARRATE_SPEC_ID] }
})

/**
 * The Adventure genre's shipped preset.
 *
 * ## It ships ENABLED
 *
 * The condition set for this lane was "enabled if the create path runs end to
 * end in tests", and it does: creating an Adventure session publishes the
 * create spec, seeds the cast's greetings and resolves the genre's seven
 * attribute slots, with no model call anywhere in it. The turn itself needs a
 * connection like every other turn does.
 *
 * ## What `defaults` says, and what it deliberately does not
 *
 * `genreFields` is the creation pre-fill for the three fields the genre
 * declares. `trustNarrator: false` is restated here rather than left to the
 * declaration's default because it is the one field with a safety meaning: a
 * preset is what a person starts from, and the answer to "does the model get to
 * change my character's health without asking" should be visible in the thing
 * that decided it.
 *
 * No `lorebookId`: the genre requires a lorebook and has no opinion about
 * which, and a preset naming one would name a row that exists on the machine it
 * was written on.
 */
export const adventureDefaultPreset: PresetDecl = preset("adventure-default", {
	genre: adventureGenre,
	label: "Adventure",
	description:
		"A narrated world with a cast that acts on its own, stats and an inventory that change as you play, and a story clock that moves.",
	bindings: {
		[sessionEvents.sessionCreated]: ADVENTURE_CREATE_SPEC_ID,
		[sessionEvents.messageRespond]: ADVENTURE_RESPOND_SPEC_ID
	},
	actions: {
		include: [
			ADVENTURE_LOOK_SPEC_ID,
			ADVENTURE_REST_SPEC_ID,
			ADVENTURE_ADVANCE_TIME_SPEC_ID
		]
	},
	defaults: {
		genreFields: {
			tone: "grounded",
			difficulty: "normal",
			trustNarrator: false
		}
	},
	enabled: true
})

export const CORE_PRESETS: PresetDecl[] = [
	chatDefaultPreset,
	adventureDefaultPreset
]

/** The seed-pass shape: idempotence key + the row fields SP writes. */
export interface CorePresetSeed {
	/** Never change spelling — existing installs match on this. */
	seedKey: string
	name: string
	description: string
	genreId: string
	/**
	 * Event → spec, from the declaration. Config references stay absent here
	 * (= the spec's shipped default): a config id is an instance fact.
	 */
	bindings: Record<string, { spec: string }>
	/**
	 * The creation pre-fill, from the declaration's `defaults` (23 §9).
	 * Written verbatim into the row's `defaults` column, so a declared
	 * pre-fill reaches the create form without an extra carrier. Absent on
	 * every core preset today — core ships no opinion about a new session's
	 * name or scenario — and present the moment one declares it.
	 *
	 * Loosely typed on purpose: `PresetDefaults` is the SDK's *authoring*
	 * shape, and this is the row shape, which is a JSON column the create form
	 * reads key by key.
	 */
	defaults?: Record<string, unknown>
	/**
	 * ⚠ **`includedActions` is deliberately not here**, though every core
	 * preset declares `actions.include`.
	 *
	 * The column reads NULL as "the companion rule" — every action a spec
	 * contributed for this genre comes along, enabled by default when it is in
	 * the genre owner's own namespace — and an array as "exactly these". Core's
	 * actions ARE in core's namespace for core's genres, so the two answers are
	 * the same list and NULL is the one that keeps being right when a later
	 * release adds a fourth. The declaration still carries the list, because an
	 * announcement states what a package offers; the row states what an
	 * administrator curated, and nobody has curated anything yet.
	 */
	/**
	 * Whether the instance offers it the moment it is seeded.
	 *
	 * The column defaults to true and every core preset has always been
	 * offered, so this is written only where a declaration says so. It is a
	 * SEED-time value: an administrator who later disables a preset keeps that
	 * decision, because the seed pass never touches a row it did not create.
	 */
	enabled?: boolean
	isDefault: boolean
	isImmutable: boolean
}

/** One declaration, in the shape SP's seed pass writes. */
const seedOf = (
	decl: PresetDecl,
	seedKey: string,
	isDefault: boolean
): CorePresetSeed => ({
	seedKey,
	name: decl.label,
	description: decl.description ?? "",
	genreId: decl.genre,
	bindings: Object.fromEntries(
		Object.entries(decl.bindings).map(([event, b]) => [
			event,
			{ spec: b.spec }
		])
	),
	...(decl.defaults
		? { defaults: decl.defaults as Record<string, unknown> }
		: {}),
	...(decl.enabled === undefined ? {} : { enabled: decl.enabled }),
	isDefault,
	isImmutable: true
})

export const CORE_PRESET_SEEDS: CorePresetSeed[] = [
	// ⚠ The seed keys never change spelling — existing installs match on them.
	seedOf(chatDefaultPreset, "core-chat-default", true),
	/**
	 * ⚠ `isDefault: false`. "Default" here means *the preset a session with no
	 * preset falls back to*, and there is exactly one of those on an instance.
	 * Adventure is offered, not assumed.
	 */
	seedOf(adventureDefaultPreset, "core-adventure-default", false)
]
