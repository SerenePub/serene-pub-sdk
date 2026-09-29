/**
 * Descriptors — the shared-scope declaration of a **node definition** (01 §1, 04 §3;
 * NOMENCLATURE §5 — *node type* is retired, ruled 2026-09-14).
 *
 * A descriptor is data: it can be listed, rendered and validated without loading
 * the handler that implements it. That is what lets the plugin manager and the
 * editor work from rows (10 §10.2).
 */

import { pluginRuleRef } from './pluginRuleRef.js'
import type { ShapeId } from './shapes.js'
import type { CapabilityId } from './capabilities.js'
import type { ReviewPosition } from './review.js'
import type { TemplateScope, VarField } from './template.js'
import type { VariableDecl } from './variables.js'
import { checkBandDeclarations } from './bands.js'
import { settingsSchemaFindings, type SettingsSchema, type FieldDecl } from './settings.js'
import { i18nFindings, isI18n, localeMapOf, type I18n, type LocaleMap } from './i18n.js'
import { eventById, notADeclaredEvent } from './events.js'
import {
	enabledWhenFindings,
	evaluateEnabledWhen,
	normalizeEnabledWhen,
	type EnabledWhen,
	type EnabledWhenDecl,
} from './predicates.js'
// The widget declaration a session mode's `panels` are: it lives with the
// layout document that places them, and imports nothing from here.
import type { WidgetDecl } from './layout.js'
import { widgetReadsFindings } from './widgetDecls.js'
import type { MediaCapability } from './media.js'
import { contentHash, declarationData, refuseUnlessSameHash, type DisplayKeys } from './hash.js'
// The substrate's `settings` slot is projected onto a registry row beside the
// author's; the contract material leaves it out by name (`authoredSlots`).
// `settingsSlot.ts` imports nothing from here at runtime, so no cycle.
import { authoredSlots } from './settingsSlot.js'
import { DEFAULT_CHANNEL, parseChannel } from './channels.js'
// F39's registry door: `register()` hears `core:verdict/settings-travel` for
// every declared out-port (01 §13). `verdicts.ts` reads only leaf
// vocabulary, so this import starts no cycle.
import { refusalText, settingsTravelVerdict } from './verdicts.js'

/**
 * The node kinds (R-13, ruled 2026-09-14): **inlet** (where the run enters) ·
 * **query** (reads) · **task** (pure transform) · **oracle** (calls out to an
 * external nondeterministic source — a model, TTS, image gen, embeddings, a human)
 * · **outlet** (the only effect-capable kind: writes, attaches, emits — the run
 * leaves into the world here). Was `input · query · task · provider · consumer`
 * until 2026-09-16; the kind is part of the id grammar (`core:inlet/…`), so every
 * definition id moved with it.
 *
 * `entry` is the odd one out and deliberately so: the first five are **nodes**
 * — things a spec wires — and an entry type is a **row shape**, the declared
 * answer to "what kind of thing is this lorebook row". It is a Kind rather than
 * a registry of its own because everything downstream of a declaration is the
 * same machinery: one `snapshotRegistry`, one content hash, one boot sync, one
 * freeze rule (the argument 18 §2 makes for script kinds, one construct over).
 * @experimental
 */
export type Kind = 'inlet' | 'query' | 'task' | 'oracle' | 'outlet' | 'entry'

// One display-text type across the SDK, owned by `i18n.ts` (R-20): `I18n` and
// `LocaleMap` are re-exported here under the names the descriptor surface has
// always used, and `settings.ts` spells the same type `I18nText`.
export type { I18n, LocaleMap } from './i18n.js'

/**
 * Slot kinds (12 §2). Siblings; only two are ever cross-referenced.
 *
 * `settings` (R-9, ruled 2026-09-15) is the one kind **no author declares**:
 * the substrate declares it, on every definition that is `optional`
 * (`enabled`), every one whose `effects` gate (`review`), and every gather
 * clause (`mode`). The slot name `settings` is reserved for it — `register`
 * refuses a descriptor that authors one, and an out-port of the name, since
 * `<node>.settings` is the address F39 reads as a switch — and it is projected into the
 * registry row by `snapshotRegistry` rather than written on the descriptor,
 * so the executor keeps reading `config[key].settings.*` exactly as before
 * and the panel renders it from the row like any slot (`settingsSlot.ts`).
 * @experimental
 */
export type SlotKind =
	| 'connection'
	| 'sampling'
	| 'prompts'
	| 'template'
	| 'parameters'
	| 'wire'
	| 'variables'
	| 'scripts'
	| 'settings'

/** @experimental */
export interface SlotDecl {
	kind: SlotKind
	/**
	 * One of the few settings people actually change on this node.
	 *
	 * A panel that lists every declared setting equally makes the reader find
	 * the prompt among the thresholds every time. The author is the one who
	 * knows which three or four are reached for and which exist for the day
	 * somebody needs them, so the answer is declared rather than guessed from
	 * type or position — a client heuristic would be wrong differently on every
	 * plugin.
	 *
	 * Presentation, not permission: nothing is hidden by it, and everything
	 * unmarked is one disclosure away.
	 */
	quick?: boolean

	/** For connection/sampling: which shape's connections are eligible. */
	shape?: ShapeId

	/**
	 * What the connection in this slot must be able to do.
	 *
	 * Unmet is a hard failure at bind, naming the capability in the words a
	 * person saw when they configured it — never a 400 from a provider that was
	 * asked for something its API has no field for.
	 *
	 * On the SLOT rather than on the Descriptor because the requirement is about
	 * a *connection*, and a connection comes from a slot: a node with two
	 * connection slots needs to state two different things.
	 *
	 * This supersedes `shape` for connection slots. `shape` says "an image-gen
	 * connection"; this says "one that can do text→image", which is the same fact
	 * with the modality assumption removed.
	 */
	requires?: readonly CapabilityId[]

	/**
	 * What the binding will *use if present* and must cope without.
	 *
	 * The binding asks with `ctx.can(id)`, which is narrowed to exactly these
	 * ids — so an undeclared capability, or a typo, does not compile. The
	 * fallback path is the author's to write; declaring something optional is a
	 * promise that both branches exist.
	 *
	 * ⚠ Not the same `optional` as `Descriptor.optional` further down this file,
	 * which means "producing nothing is a legitimate outcome for this node". Two
	 * meanings, one word, one file — the objects differ so it compiles, and the
	 * reader is the one who pays. Named to match the ruling; if it is ever
	 * renamed, `prefers` is the word that was wanted.
	 */
	optional?: readonly CapabilityId[]
	/** What this slot is for, shown under its option. Display text — see FieldDecl. */
	description?: I18n
	/** Which lens renders it (05 §3). */
	facet?: string
	/** For prompts: the authored text fields. */
	fields?: Record<string, { type: 'text'; i18n?: I18n }>
	/** For parameters: the declared schema. Options may be sourced from the connection. */
	schema?: Record<string, FieldDecl>
	/**
	 * Which template language this slot's source is written in — a registry id, not a
	 * hardcoded literal (src/engines.ts). The value stored in the slot carries it too, so
	 * two slots in one spec may use different engines.
	 *
	 * The one-element spelling of `acceptedEngines`, and permanently valid: a reader
	 * must resolve both, or every slot authored before the set existed silently widens
	 * to the host's default.
	 */
	engine?: string
	/**
	 * Every template language this slot accepts, most-preferred first.
	 *
	 * A template's pool is `(what it renders, which language)` and stays that way —
	 * a Liquid source and a Handlebars one are not interchangeable, and neither
	 * renders the other. What a set widens is the SLOT: a picker offers the union of
	 * the accepted pools, so a person may write the same layout in either language
	 * without the slot having to be re-declared.
	 *
	 * **Order is meaning.** The first entry is what a NEW template here is written
	 * in, so re-ordering this list changes what an untouched install produces —
	 * which is why it is content, hashed with the rest of the declaration.
	 *
	 * Supersedes `engine` when both are given; an empty array declares nothing.
	 */
	acceptedEngines?: readonly string[]
	/**
	 * For `wire` slots: the format id this oracle defaults to. Overridable through the
	 * normal scope chain, and in core sourced from the connection's adapter metadata so
	 * picking Ollama gets the right instruct format without configuring anything
	 * (src/wire.ts).
	 */
	format?: string
	/**
	 * For template slots: the variables this template may reference.
	 *
	 * ⚠ Required, and 16 §4 is wrong to imply otherwise. A *source* template renders one
	 * item out of a collection, and the item's shape lives inside the port's payload
	 * rather than on the port — so typed ports alone cannot tell an author what
	 * `{{ entry.title }}` is allowed to be. See src/template.ts.
	 */
	variables?: TemplateScope
	/**
	 * For `scripts` slots: which script types this hook accepts (18 §4a).
	 *
	 * Pinned ids — `core:script:text/transform@1` — and **part of the content
	 * hash** (S3): widening or narrowing what a hook accepts changes what an
	 * untouched spec does, which is the `optional` lesson applied before it is
	 * re-learned. Plain strings rather than the `ScriptKindId` alias, because
	 * scripts.ts already imports from this module and a type-only cycle is
	 * still a cycle.
	 *
	 * The value stored in a scripts slot is an ordered list of script row ids —
	 * a chain. Transform chains fold; verdict chains reduce (18 §5). The chain
	 * is configuration like any slot value: resolved through the scope chain,
	 * carried by presets, exported with the document.
	 */
	accepts?: string[]
	/**
	 * For `scripts` slots: where the chains apply, as (port, phase) — the
	 * substrate declaration of 18 §4a. `before` transforms a value entering the
	 * named in-port; `after` transforms what left the named out-port. The
	 * binding never sees a chain and cannot decline one; declaring is all a
	 * type does, which is what makes a plugin's hook trustworthy without
	 * trusting the plugin (03 §4 symmetry).
	 */
	port?: string
	phase?: 'before' | 'after'
	/**
	 * For `scripts` slots: read-only context this hook supplies beyond the
	 * port's own variables — a speaker's name, the cast list. In-only **by
	 * construction**: extras have no legal out declaration, so the general
	 * in-but-not-out rule (18 §6a) covers them with no special case. The
	 * editor offers exactly `ports + extras` as the fixed choices for a
	 * script's declared reads — never a freeform name, which would be a
	 * declaration nothing supplies.
	 */
	extras?: string[]
	/**
	 * For `variables` slots: which context variable each key renders.
	 *
	 * `{ characters: 'core:var/characters@1' }` says this node produces a value
	 * called `characters`, and how it is presented is the registered variable's
	 * business rather than this node's. Each key becomes one addressable setting
	 * pointing at a swappable template row — so a prose rendering written for one
	 * pipeline can be selected from any other pipeline that renders the same
	 * variable. That cross-pipeline reuse is the point, and it only works because
	 * the row is keyed by *what it renders* rather than by which spec it was
	 * authored in.
	 *
	 * Named `renders` rather than `variables` because the field above already
	 * owns that name for a different question — that one asks what a template
	 * *may reference*, this one asks what a slot *produces*.
	 */
	renders?: Record<string, string>
	/**
	 * For `variables` slots: the slot also renders every **band declared
	 * upstream** of in-port `from` (typed templates P2) — each under its band
	 * key, through the variable the declaring source names
	 * (`Descriptor.bands`). So `renders` is open: a plugin's source adds a
	 * layout setting here by declaring its band, with no edit to this node.
	 *
	 * `raw` names declared bands this node exposes as its own value with no
	 * layout — Assemble's `characterLore`, which has always reached a template
	 * as the raw list and which no layout could change.
	 *
	 * Followed through any node that takes candidates in (concatenation,
	 * fusion, ranking); `rendersAt` is the answer for one node of a document.
	 * **Contract** — hashed with the slot: which bands a node renders is what
	 * its template may place.
	 * @experimental
	 */
	rendersBands?: { from: string; raw?: readonly string[] }
}

/**
 * One band of a `share` or `perMember` parameter.
 *
 * The client renders a bar with a label and a colour per band, and **none of
 * those may be written in the client**. A plugin that adds a sixth retrieval
 * source has to get a labelled band without anyone editing that screen, which
 * is the 1:1 rule applied to a control that would otherwise need a hardcoded
 * list of five.
 */
/**
 * The field language, re-exported from settings.ts — where it is now defined
 * once for node params, plugin settings, session-mode fields and message-block
 * forms alike.
 *
 * These used to be a second, subtly different declaration living here: it had
 * `share` and `perMember` where settings had `text`, keyed its label `i18n`
 * where settings said `label`, and nothing converted between the two. The
 * comment in settings.ts promising "the same shape node params use" was
 * describing an intention, not the code. It is the code now.
 */
export type { MemberDecl, FieldDecl, FieldType } from './settings.js'
export { fieldLabel, fieldAccepts } from './settings.js'

/**
 * One interior script point (18 §4e): a named moment inside a binding's work
 * where a user chain may run, and which script kinds may be attached there.
 *
 * `accepts` is the attachment rule, on the same terms as `SlotDecl.accepts`
 * for a port hook — pinned ids, part of the content hash. Plain strings rather
 * than the `ScriptKindId` alias for the reason that field gives: scripts.ts
 * imports from this module. `label` is display text, stripped from the hash.
 * @experimental
 */
export interface ScriptPointDecl {
	key: string
	accepts: string[]
	label?: I18n
	description?: I18n
}

/**
 * A definition's interior points, as copies — the one reader of
 * `scriptPoints` (the executor's broker and the registry projection both go
 * through it), so a caller may not edit the declaration through it.
 * @experimental
 */
export function scriptPointsOf(d: { scriptPoints?: ReadonlyArray<ScriptPointDecl> }): ScriptPointDecl[] {
	return (d.scriptPoints ?? []).map((p) => ({
		...p,
		key: String(p.key),
		accepts: Array.isArray(p.accepts) ? [...p.accepts] : [],
	}))
}

/**
 * The message verbs no genre may remove (R-15, ruled 2026-09-15): a person
 * can always stop a reply, branch a session and rewrite a line. Not keys of
 * `SessionShape.messageVerbs`; a declaration naming one `false` is refused
 * at registration (`assertMessageVerbFloors`).
 * @experimental
 */
export const MESSAGE_VERB_FLOORS = ['stop', 'branch', 'edit'] as const
/** @experimental */
export type MessageVerbFloor = (typeof MESSAGE_VERB_FLOORS)[number]

/**
 * The opt-in built-ins: core's writes a genre may switch off and never
 * re-implement. Default on.
 * @experimental
 */
export const MESSAGE_VERB_BUILT_INS = ['delete', 'hide', 'swipe'] as const
/** @experimental */
export type MessageVerbBuiltIn = (typeof MESSAGE_VERB_BUILT_INS)[number]

/** The genre-declared content actions — built-in write + declared content. @experimental */
export const MESSAGE_VERB_CONTENT = ['retry', 'extend', 'stepBack'] as const
/** @experimental */
export type MessageVerbContent = (typeof MESSAGE_VERB_CONTENT)[number]

/** Every forbiddable verb, in the order the availability map reads them. @experimental */
export const MESSAGE_VERBS = [...MESSAGE_VERB_CONTENT, ...MESSAGE_VERB_BUILT_INS] as const
/** @experimental */
export type MessageVerb = (typeof MESSAGE_VERBS)[number]

/**
 * The turn controls (lair pass B7 + B8, 2026-09-27) — the composer's presses
 * that move the story on, as opposed to the message verbs, which act on one
 * row. Keys of `SessionShape.turnControls`, in the order the extra venue
 * draws them.
 *
 * - `advance` is **Continue**: it fires the turn order's head
 *   (`sessions:fireTurn` with no entry). ⚠ Not `extend` — that is the
 *   message verb that extends one reply by prefill (`messageVerbs.extend`).
 * - `pick` is **Pick who speaks**: it fires a character the person names
 *   (`sessions:fireTurn` with a `character:<id>` entry the order does not
 *   hold).
 * - `narrate` fires a **narrator turn** (`sessions:fireTurn` with a `null`
 *   ref the order does not hold) — only a `voice: 'narrator'` genre has a
 *   narrator to fire (`turnControlDefault`).
 * - `retake` is **Regenerate the last turn, as a whole** (lair pass R2,
 *   owner 2026-09-28; label _Regenerate_, `sessions:retakeTurn`): it
 *   deletes the newest turn's **turn yield** — every row that turn's run
 *   created, on every channel, never a person's own line — and takes the
 *   same turn again. ⚠ Not `retry`, the message verb that rewrites ONE
 *   reply in place and keeps its swipes. Offered only where a genre
 *   declares it (`turnControlDefault`): a genre whose turn writes one row
 *   keeps `retry`.
 * @experimental
 */
export const TURN_CONTROLS = ['advance', 'pick', 'narrate', 'retake'] as const
/** @experimental */
export type TurnControl = (typeof TURN_CONTROLS)[number]

/**
 * What an undeclared turn control resolves to — read off the shape's own
 * declarations, so a genre that says nothing keeps what its shape already
 * means (R42: turn controls only where there is somebody to take a turn):
 *
 * - `advance` and `pick` are on where the shape has a **character system**
 *   (`characters` declared with a `max` other than 0; an unreadable shape
 *   counts as having one) — the composer's historical rule.
 * - `narrate` is on where the shape has a **narrator** (`voice:
 *   'narrator'`), the one genre family with a narrator to fire.
 * - `retake` is never on by default: nothing in a shape says a turn writes
 *   more than one row, so a genre opts in (`turnControls.retake: true`).
 * @experimental
 */
export function turnControlDefault(shape: unknown, control: TurnControl): boolean {
	const s = shape && typeof shape === 'object' ? (shape as Record<string, unknown>) : null
	if (control === 'retake') return false
	if (control === 'narrate') return s?.voice === 'narrator'
	if (!s) return true
	const characters = s.characters as { max?: unknown } | undefined
	return !!characters && typeof characters === 'object' && (characters.max ?? 1) !== 0
}

/**
 * One turn control as a genre declares it: `true` / `false`, or offered with
 * a **present-when** — enabled-when predicates over the session's published
 * values (`predicates.ts`, the junction's grammar) that say whether the
 * control *applies* in the session's current mode. A control whose
 * present-when fails is **hidden**, not greyed: it has no meaning in that
 * mode. Its `reason` is the sentence the door
 * refuses a press with. Whether an applicable control can be pressed *now*
 * is the core action's own enabled-when — greyed, with a reason.
 * @experimental
 */
export type TurnControlDecl = boolean | { presentWhen: EnabledWhenDecl }

/**
 * One turn control, resolved: offered at all, and the present-when to
 * evaluate against the published values (empty = always present).
 * @experimental
 */
export interface TurnControlPresence {
	offered: boolean
	presentWhen: EnabledWhen[]
}

/** Every turn control, resolved. @experimental */
export type TurnControlPolicy = Record<TurnControl, TurnControlPresence>

/**
 * What turn controls this shape offers, resolved — the `resolveWrites`
 * posture: an undeclared or unreadable control is the shape's default
 * (`turnControlDefault`), `false` takes it away, `true` or an object offers it. Pure, and
 * takes `unknown` for a stored shape.
 *
 * With a `channel` (a slug or `slug:lane`; lair re-plan R6), that channel's
 * declared `ChannelDecl.turnControls` win over the genre's, key by key — the
 * `messageVerbs` merge. A channel the shape does not declare in the long
 * form answers the genre's policy.
 * @experimental
 */
export function resolveTurnControls(shape: unknown, channel?: string): TurnControlPolicy {
	const declared =
		shape && typeof shape === 'object'
			? ((shape as { turnControls?: unknown }).turnControls ?? null)
			: null
	const genre = plainObject(declared) ?? {}
	const own = channel === undefined ? undefined : channelTurnControlsOf(shape, channel)
	const d: Record<string, unknown> = own ? { ...genre, ...own } : genre
	return Object.fromEntries(
		TURN_CONTROLS.map((t) => {
			const v = d[t]
			if (v === true || v === false) return [t, { offered: v, presentWhen: [] }]
			if (v && typeof v === 'object' && !Array.isArray(v))
				return [
					t,
					{
						offered: true,
						presentWhen: normalizeEnabledWhen((v as { presentWhen?: unknown }).presentWhen),
					},
				]
			return [t, { offered: turnControlDefault(shape, t), presentWhen: [] }]
		}),
	) as TurnControlPolicy
}

/** A plain object, else undefined — how a stored declaration's map is read. */
function plainObject(v: unknown): Record<string, unknown> | undefined {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

/** One declared channel's own `turnControls`, by slug (the lane is multiplicity). */
function channelTurnControlsOf(shape: unknown, channel: string): Record<string, unknown> | undefined {
	const channels = plainObject(shape)?.channels
	if (!Array.isArray(channels)) return undefined
	const slug = parseChannel(channel).slug
	for (const raw of channels) {
		const decl = plainObject(raw)
		if (decl && typeof decl.slug === 'string' && parseChannel(decl.slug).slug === slug)
			return plainObject(decl.turnControls)
	}
	return undefined
}

/**
 * Is this turn control present over these published values — offered, and
 * every present-when holds? The failing predicate's reason when not; `null`
 * reason for a control the genre does not offer at all.
 * @experimental
 */
export function turnControlPresent(
	policy: TurnControlPolicy,
	control: TurnControl,
	values: unknown,
): { present: true } | { present: false; reason: LocaleMap | null } {
	const p = policy[control]
	if (!p.offered) return { present: false, reason: null }
	const verdict = evaluateEnabledWhen(p.presentWhen, values)
	return verdict.enabled ? { present: true } : { present: false, reason: verdict.reason }
}

/**
 * A `turnControls` declaration's faults, refused at the declaration: an
 * unknown control, a value that is neither a boolean nor `{ presentWhen }`,
 * a present-when the enabled-when grammar refuses, or a present-when over
 * `item.*` (a turn control acts on no row).
 * @experimental
 */
export function assertTurnControls(shape: SessionShape | undefined, who: string): void {
	const raw = shape?.turnControls as unknown
	if (raw === undefined) return
	const problems: string[] = []
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		problems.push(`turnControls is { ${TURN_CONTROLS.map((t) => `${t}?`).join(', ')} }`)
	} else {
		for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
			if (!(TURN_CONTROLS as readonly string[]).includes(k)) {
				problems.push(`turnControls.${k}: not a turn control — one of ${TURN_CONTROLS.join(', ')}`)
				continue
			}
			if (typeof v === 'boolean') continue
			if (!v || typeof v !== 'object' || Array.isArray(v) || !('presentWhen' in v)) {
				problems.push(
					`turnControls.${k}: true, false, or { presentWhen } — enabled-when predicates ` +
						`over the published values, such as { on: 'session.fields.<field>', ` +
						`equals: '<value>', reason: { en: '<why it is absent>' } }`,
				)
				continue
			}
			const pw = (v as { presentWhen: unknown }).presentWhen
			problems.push(...enabledWhenFindings(pw, `turnControls.${k}.presentWhen`))
			normalizeEnabledWhen(pw).forEach((p, i) => {
				if (p.on === 'item' || p.on.startsWith('item.'))
					problems.push(
						`turnControls.${k}.presentWhen[${i}]: reads '${p.on}' — a turn control acts ` +
							`on no row, so it cannot read one`,
					)
			})
		}
	}
	if (problems.length) throw new Error(`${who}: ${problems.join('\n')}`)
}

/**
 * The writes a genre may switch off (R-B, 2026-09-17) — what a session does
 * *beyond messages*. Keys of `SessionShape.writes`, in the order a policy
 * reads them.
 * @experimental
 */
export const SESSION_WRITES = ['lore', 'scenes'] as const
/** @experimental */
export type SessionWrite = (typeof SESSION_WRITES)[number]

/** Availability of every switchable session write. Absent means both on. @experimental */
export type SessionWritePolicy = Record<SessionWrite, boolean>

/**
 * What this shape lets a session write, resolved. Absent, unknown or
 * unreadable is **both on** — the standard chat's posture, and the same
 * "a policy that cannot be read refuses nothing" rule `messageVerbs` keeps.
 * Only an explicit `false` takes a write away.
 *
 * Pure, and takes `unknown` on purpose: the app reads a shape that arrived
 * from a stored registry row, not a typed declaration.
 * @experimental
 */
export function resolveWrites(shape: unknown): SessionWritePolicy {
	const declared =
		shape && typeof shape === 'object'
			? ((shape as { writes?: unknown }).writes ?? null)
			: null
	if (!declared || typeof declared !== 'object')
		return Object.fromEntries(SESSION_WRITES.map((w) => [w, true])) as SessionWritePolicy
	const d = declared as Record<string, unknown>
	return Object.fromEntries(
		SESSION_WRITES.map((w) => [w, d[w] !== false]),
	) as SessionWritePolicy
}

/**
 * A `writes` declaration whose values are not booleans is refused — with a
 * sentence, at the declaration, where the author is. Shared by `register`
 * (an inlet's `sessionShape`) and `genre()` (a genre's `shape`), on the same
 * terms as `assertMessageVerbFloors`. Unknown keys are ignored, as the
 * resolver ignores them: a key this release does not know is not a write.
 * @experimental
 */
export function assertSessionWrites(shape: SessionShape | undefined, who: string): void {
	const writes = shape?.writes as Record<string, unknown> | undefined
	if (writes === undefined) return
	if (!writes || typeof writes !== 'object' || Array.isArray(writes))
		throw new Error(
			`${who} declares a 'writes' that is not an object. A genre's writes are ` +
				`{ lore?: boolean; scenes?: boolean } — absent means both on, and only an ` +
				`explicit false takes one away (R-B).`,
		)
	const bad = SESSION_WRITES.filter(
		(w) => writes[w] !== undefined && typeof writes[w] !== 'boolean',
	)
	if (!bad.length) return
	throw new Error(
		`${who} declares writes { ${bad.map((w) => `${w}: ${JSON.stringify(writes[w])}`).join(', ')} }. ` +
			`Each write is a boolean or absent — absent means on, and only an explicit ` +
			`false takes the write away (R-B).`,
	)
}

/**
 * The five built-in writes (R-15), by the verb a person knows them as: the
 * one-node spec core runs for each, and the outlet that spec ends in.
 *
 * Here rather than only in the core catalog because the **validator** needs
 * them (U5b review W8): a built-in outlet performs the item rule's write —
 * the handler judged who may act on which row before the run began — so a
 * spec that is not the built-in's own placing one would perform that write
 * with nobody having judged anything. `validate()` refuses the placement
 * unless the document's id is one of `BUILTIN_SPEC_IDS`, and the host
 * refuses the commit on the same test (defence in depth). A manifest
 * permission letting a plugin spec place one is the future this leaves room
 * for; it is not granted today.
 * @internal
 */
export const BUILTIN_SPEC_IDS = Object.freeze({
	delete: 'core:spec/builtin-delete',
	hide: 'core:spec/builtin-hide',
	edit: 'core:spec/builtin-edit',
	swipe: 'core:spec/builtin-swipe',
	branch: 'core:spec/builtin-branch',
} as const)
/** @internal */
export type BuiltInKind = keyof typeof BUILTIN_SPEC_IDS

/** The outlet each built-in's spec ends in — `effects: 'write'`, every one. @experimental */
export const BUILTIN_OUTLET_IDS = Object.freeze({
	delete: 'core:outlet/delete-message@1',
	hide: 'core:outlet/hide-message@1',
	edit: 'core:outlet/edit-message@1',
	swipe: 'core:outlet/swipe-message@1',
	branch: 'core:outlet/branch-session@1',
} as const)

/** Is this definition id one of the five built-in write outlets? @experimental */
export const isBuiltInOutlet = (definitionId: string): boolean =>
	(Object.values(BUILTIN_OUTLET_IDS) as string[]).includes(definitionId)

/** Is this spec id one of the five built-in specs — the only documents that may place a built-in outlet? @internal */
export const isBuiltInSpec = (specId: string): boolean =>
	(Object.values(BUILTIN_SPEC_IDS) as string[]).includes(specId)

/**
 * The form-answer pair (plans/29 R-15 *Forms*; 30 §U5d, built 2026-09-17):
 * the inlet `core:event/form-addressed@1` lands on, and the outlet that
 * commits an oracle's answer exactly as a click would. The outlet may be
 * placed only in a document whose inlet is the form-addressed one
 * (`validate()`; the host checks the same at the commit): it answers THE
 * form the event carried, and a document reached by any other event has no
 * form to answer — a spec placing it elsewhere would fire an action as
 * somebody nobody asked.
 * @internal
 */
export const FORM_ADDRESSED_INLET_ID = 'core:inlet/form-addressed@1'
/** @experimental */
export const ANSWER_FORM_OUTLET_ID = 'core:outlet/answer-form@1'

/**
 * The review-fields rule (R-15 *The review gate*; 30 §U5d): a definition
 * with `effects: 'write' | 'external'` declares `review: { fields }` — what a
 * reviewer may edit at the gate, `[]` when nothing (approve or refuse). A
 * definition that declares none still registers and still gates — the form
 * is then **inferred** from the whole payload, every field editable, which is
 * the documented fallback a plugin definition gets — but `register()` records
 * the omission as a finding and `validate()` reports it on every node bound
 * to such a definition, so a shipped effectful definition without one is
 * visible rather than silent. Every core definition declares one.
 * @experimental
 */
export function reviewFieldsFinding(d: {
	id: string
	effects?: string
	review?: { fields: readonly string[] }
}): string | null {
	if (d.effects !== 'write' && d.effects !== 'external') return null
	if (d.review && Array.isArray(d.review.fields)) return null
	return (
		`${d.id} declares effects: '${d.effects}' and no review.fields. An effectful definition ` +
		`says which of its in-ports a reviewer may edit at the gate — review: { fields: ['text'] }, ` +
		`or review: { fields: [] } when the gate is approve-or-refuse. Until it does, the form is ` +
		`inferred from the whole payload and every field is editable, including any row id.`
	)
}

const registrationFindings = new Map<string, string[]>()

/**
 * What `register()` noted about a definition without refusing it — today
 * the review-fields rule alone. Keyed by definition id; empty for a clean
 * one. Read by a host at boot to say so once, and by tests asserting that
 * every shipped effectful definition declares its fields.
 * @experimental
 */
export function definitionFindings(id?: string): string[] {
	if (id !== undefined) return [...(registrationFindings.get(id) ?? [])]
	return [...registrationFindings.values()].flat()
}

/**
 * A `messageVerbs` declaration that names a floor `false` is refused — with a
 * sentence, at the declaration, where the author is. Shared by `register`
 * (an inlet's `sessionShape`) and `genre()` (a genre's `shape`), so the two
 * places a shape can be declared cannot disagree about what a floor is.
 * Unknown keys are ignored, as the app's reader ignores them: a key this
 * release does not know is not a floor.
 * @experimental
 */
export function assertMessageVerbFloors(
	shape: SessionShape | undefined,
	who: string,
): void {
	const verbs = shape?.messageVerbs as Record<string, unknown> | undefined
	if (!verbs || typeof verbs !== 'object') return
	const forbidden = MESSAGE_VERB_FLOORS.filter((floor) => verbs[floor] === false)
	if (!forbidden.length) return
	throw new Error(
		`${who} declares messageVerbs { ${forbidden.map((f) => `${f}: false`).join(', ')} }. ` +
			`Stop, branch and edit are floors — present in every genre, never switched off ` +
			`(R-15). A genre may switch off delete, hide or swipe, and may forbid retry, ` +
			`extend or stepBack; drop the floor from the declaration.`,
	)
}

/** @experimental */
export interface PortDecl {
	[port: string]: ShapeId
}

/**
 * `Out`/`In` are generic so the *port names* survive into the type system. That is what
 * lets the builder offer `$.history.messages` with autocomplete instead of
 * `$ref('history', 'messages')` with a string (see src/scope.ts). Both default to the
 * open `PortDecl`, so nothing that ignores the generics changes.
 */
/**
 * The chat-shape contract a mode-bearing input type carries (19 §1). See
 * `Descriptor.shape` for the rules; this is the vocabulary.
 *
 * Bounds omit `max` for "unlimited" and omit the whole capability for "does
 * not exist here". Every field is optional so the standard mode can state
 * today's behaviour exactly and a prose mode can state almost nothing.
 * @experimental
 */
export interface SessionShape {
	/** The character system: toggles, ordering, pickers, cast rows. */
	characters?: { min: number; max?: number }
	/** The persona system. Absent or `max: 0`: the user is prose. */
	personas?: { min: number; max?: number }
	/** The lorebook attachment picker, and retrieval satisfiability. */
	lorebook?: 'optional' | 'required'
	/** What the send surface is. `none` for purely trigger-driven modes. */
	composer?: 'text' | 'none'
	/** Whose name the seed line carries (16's seedName rule, declared). */
	voice?: 'character' | 'narrator'
	/**
	 * Mode-declared per-session fields (`SettingsSchema` — the one field
	 * language). Rendered in session settings, stored on the session, supplied
	 * back through this input's published document.
	 */
	fields?: SettingsSchema
	// No `turnOrder` (retired 2026-09-23, R28): the Turn order control is the
	// turn-order spec's `strategy` node and its `expose.swaps`, like any other
	// swappable node — see `turnOrderSpec()` in `@serene-pub/core-catalog`.
	/**
	 * Does the session settings form offer a **Scenario** field (§4.11,
	 * R12)? Declared, never assumed: chat, adventure, lair and whodunit say
	 * `true`; guide and writing-room say `false`. Absent = no field.
	 */
	scenario?: boolean
	/**
	 * Does the session settings form offer **Tags** (§4.11, R12)? `true` for
	 * every core genre. Absent = no tags section.
	 */
	tags?: boolean
	/**
	 * Whether creating a chat of this mode seeds the cast's greeting messages,
	 * and on which channel (20 §7). Absent means the default — **on, on
	 * `main`** — so a custom input node gets the standard chat's welcoming
	 * behaviour for free and turns it off or redirects it only if it wants to.
	 * Core's `user-message` input declares it explicitly so the reusable case
	 * reads at a glance.
	 */
	greeting?: {
		/** Seed character greetings on creation. Default true. */
		enabled?: boolean
		/** Which channel the greetings land on. Default `main`. */
		channel?: string
	}
	/**
	 * Which message verbs sessions of this genre offer (20 §4; R-15, ruled
	 * 2026-09-15). Absent means all on — the standard chat's posture. Core
	 * owns the mechanics and integrity rules; this only declares
	 * *availability*, checked server-side at the verb (presence is
	 * presentation, refusal is the law).
	 *
	 * Three groups, and the type is the enforcement:
	 *
	 *  · **Floors** — `stop` · `branch` · `edit` — are **unrepresentable
	 *    here**, and `register`/`genre()` refuse a declaration that names one
	 *    `false` (`assertMessageVerbFloors`). They are present in every genre:
	 *    a person can always stop a reply, always branch a session and always
	 *    rewrite a line, and a genre that could take those away would own the
	 *    user.
	 *  · **Opt-in built-ins** — `delete` · `hide` · `swipe` — are core's
	 *    writes (`core:outlet/delete-message@1` …), always emitting what
	 *    changed; a genre may switch one off, never re-implement it.
	 *  · **Genre-declared content actions** — `retry` (regenerate) ·
	 *    `extend` · `stepBack` — are the genre's pipeline producing text
	 *    plus core's rewrite of the row. A dice-are-final genre forbidding
	 *    `retry` is a real design.
	 *
	 * ⚠ `extend` here is the **prefill** extend — carry one reply on. The
	 * composer's Continue, which fires the next turn, is a turn control
	 * (`turnControls.advance`), switched separately.
	 */
	messageVerbs?: {
		retry?: boolean
		extend?: boolean
		stepBack?: boolean
		delete?: boolean
		hide?: boolean
		swipe?: boolean
	}
	/**
	 * Which turn controls sessions of this genre offer, and when each is
	 * present (lair pass B7 + B8, 2026-09-27). Absent is the shape's
	 * default (`turnControlDefault`: Continue and Pick where there is a
	 * character system, narrate where there is a narrator). A
	 * control is `true`, `false`, or `{ presentWhen }` — enabled-when
	 * predicates over the published values; when they fail the control is
	 * hidden, and the door refuses a press with the failing reason
	 * (`TurnControlDecl`). Enforced server-side at the fire, like
	 * `messageVerbs`: presence is presentation, refusal is the law.
	 *
	 * `advance` is the composer's **Continue** — fire the turn order's head.
	 * ⚠ Not `messageVerbs.extend`, which extends one reply by prefill: a
	 * genre whose composed reply cannot be extended mid-sentence switches
	 * that off and keeps this.
	 *
	 * `retake` is **Regenerate the last turn** (R2, 2026-09-28) — delete the
	 * newest turn's yield and take the turn again. Never on by default: a
	 * genre whose turn writes several rows declares it.
	 */
	turnControls?: {
		advance?: TurnControlDecl
		pick?: TurnControlDecl
		narrate?: TurnControlDecl
		retake?: TurnControlDecl
	}
	/**
	 * What sessions of this genre may write beyond messages (R-B, 2026-09-17).
	 * Absent = both on — the standard chat's posture. Enforced server-side at
	 * the write, like `messageVerbs`: presence is presentation, refusal is the
	 * law.
	 *
	 * Not a third `lorebook` value: `lorebook: 'optional'` with
	 * `writes.lore: false` already reads as attach-and-reference, and the two
	 * answer different questions — one is whether a book may be attached, the
	 * other whether the session's own machinery may add to it. A genre whose
	 * lorebook is a *reference* (a rulebook, a docs set) says so here, and a
	 * user-attached pipeline or a plugin hook cannot then rewrite it mid-game.
	 *
	 * The lever is about what a **session** does. Editing the same lorebook
	 * from the lorebook screens is untouched: that is a person at a book, not
	 * a session writing through one.
	 */
	writes?: {
		/** May a session of this genre add lore entries to its lorebook? */
		lore?: boolean
		/** May a session of this genre open scenes? */
		scenes?: boolean
	}
	/**
	 * Which surface renders sessions of this mode (20 §12). Absent means
	 * core's log — today's behaviour exactly. A plugin id (`acme/crawl`)
	 * names the plugin whose declared `session-view` frame surface replaces
	 * the whole message section: the total-conversion lane. The frame gets
	 * the session over the MessageChannel and returns actions as validated
	 * requests; it forfeits core's in-log chrome deliberately. "Restyle the
	 * standard chat" is blocks, never this.
	 */
	view?: string
	/**
	 * The session's channels beyond the implicit `main` (20 §7) — filter
	 * lanes inside one session. What renders a channel is the surface story
	 * (a frame subscribes to it); what *stores* it is `messages.channel`; and
	 * pipelines choose which lanes build their context through the history
	 * query's `channel` param. Declaring one here is what makes it exist for
	 * sessions of this mode.
	 *
	 * **Slugs, and only slugs (ruling 2026-09-09).** A channel is an
	 * organizational bucket this genre chooses arbitrarily and names here; the
	 * **lanes** under a slug are runtime and open-ended — a lane exists because
	 * a pipeline wrote to it, and this genre's pipelines allocate and manage
	 * them (one lane per agent with the agent↔lane map in extension data; five
	 * ongoing private conversations under `text-messages`, with a sixth later).
	 * **No lane count is declared**, here or anywhere. `main` is always the
	 * default channel and lane 1 always the default lane, so a bare slug is
	 * `slug:1`, `main` is `main:1`, and lane 1 is stored as the bare slug —
	 * lanes from 2 up store `slug:n`. The number is multiplicity and order,
	 * never identity: the slug is the reference. Lane metadata (title,
	 * participants, open or closed) is this genre's business and lives in its
	 * extension data — core stores a string. Parse and format one with
	 * `parseChannel` / `formatChannel`.
	 *
	 * **A bare string, or a `ChannelDecl`** (R-C, 2026-09-17). The string is
	 * the whole declaration for the ordinary case and keeps meaning exactly
	 * what it meant — `'phone'` is `{ slug: 'phone', role: 'conversation' }`
	 * with the genre's `voice` and `messageVerbs`. Read the normalised list
	 * with `channelDecls`; a string stays a string in the declaration, so the
	 * content hash of every genre written before this union is unmoved.
	 */
	channels?: (string | ChannelDecl)[]
	/**
	 * The panels a session of this mode offers in the surface grid (21). The
	 * grid is container-responsive: panels flow into tracks that appear and
	 * disappear with the *content box* width (not the viewport), so opening a
	 * sidebar cascades panels the same way shrinking the window would.
	 *
	 * Absent means the default — the standard chat's single primary panel (the
	 * log + composer). A mode declares extra panels by pushing `WidgetDecl`s; a
	 * panel points either at a **native** surface (a core-registered component
	 * key, zero frontend code beyond registering it) or a **frame** (a plugin's
	 * `surfaces.panels[]` entry, opaque-origin iframe). Both wear identical
	 * chrome and both are *views onto channels* — a panel renders what a node
	 * writes to the channels it subscribes to. This is the "map / cell phone /
	 * mission list appears when the action is toggled on" lane: a node emits a
	 * `surface:open` intent naming a declared panel, and the grid flows it in.
	 *
	 * Exactly one panel should carry `role: 'primary'` — it is anchored, always
	 * placed, and never cascades to the drawer. Absent-panels defaults supply a
	 * primary log automatically, so a mode only lists what it adds.
	 */
	panels?: WidgetDecl[]
}

/**
 * One channel, declared in full (R-C, 2026-09-17) — the long form of an
 * element of `SessionShape.channels`, where the short form is the slug alone.
 *
 * Three things a genre may say about a channel that it cannot say about the
 * session as a whole: how the channel's messages **enter a prompt**, whose
 * **name** a turn triggered there speaks under, and which **verbs** its rows
 * offer. A writing room's `manuscript` is a folio with no speaker and no
 * deleting; its `main` is an ordinary conversation. One genre, two postures,
 * and nothing about either is expressible on the shape alone.
 *
 * Every field but `slug` is optional and every default is today's behaviour,
 * which is what makes the union additive: a bare string is this object with
 * `role: 'conversation'`, the genre's `voice` and the genre's `messageVerbs`.
 * @experimental
 */
export interface ChannelDecl {
	/**
	 * The channel's slug — a bare slug, never `slug:lane`. Lanes are runtime
	 * (see `SessionShape.channels`); a declaration that names one is refused.
	 */
	slug: string
	/**
	 * How this channel enters a prompt. `conversation` (the default): turns
	 * with speakers, as every channel has always been assembled. `folio`:
	 * one text block in time order, no speaker names, placed **before** the
	 * conversation — the manuscript the conversation is about.
	 */
	role?: 'conversation' | 'folio'
	/**
	 * Whose name the seed line carries for a turn triggered on this channel
	 * (the genre-wide `voice`, per channel). Default: the genre's `voice`.
	 * `none`: no seed row at all — the extend-prefill posture, which is
	 * what a folio channel wants, since a manuscript has no speaker to
	 * announce.
	 */
	voice?: 'character' | 'narrator' | 'none'
	/**
	 * Which verbs this channel's messages offer, over the genre's. Declared
	 * keys win; the rest keep the genre's answer. The floors are
	 * unrepresentable here too — `assertMessageVerbFloors` judges a channel's
	 * declaration on exactly the terms it judges a genre's.
	 */
	messageVerbs?: SessionShape['messageVerbs']
	/**
	 * The channel's display name (lair re-plan R6, 2026-09-28) — what a
	 * widget header and the composer's channel control call it: the Lair's
	 * `sanctum` is _Sanctum_. Display text (R-20), normalised by
	 * `channelDecls` to a locale map. Absent: readers show the slug, as
	 * before the field existed.
	 */
	label?: I18n
	/**
	 * Which turn controls this channel's composer offers, over the genre's
	 * `turnControls` (lair re-plan R6) — the `messageVerbs` merge rule:
	 * declared keys win, the rest keep the genre's answer. The Lair's
	 * Sanctum takes Pick who speaks and Regenerate the last turn away and
	 * keeps Continue and Narrate. Read one channel's policy with
	 * `resolveTurnControls(shape, channel)`.
	 */
	turnControls?: SessionShape['turnControls']
}

/** The roles a channel's messages may play in a prompt. @experimental */
export const CHANNEL_ROLES = ['conversation', 'folio'] as const
/** @experimental */
export type ChannelRole = (typeof CHANNEL_ROLES)[number]

/** The voices a channel's turn may seed under. `none` seeds no row at all. @experimental */
export const CHANNEL_VOICES = ['character', 'narrator', 'none'] as const
/** @experimental */
export type ChannelVoice = (typeof CHANNEL_VOICES)[number]

/**
 * This shape's channels as full declarations, defaults resolved — the one
 * reader every consumer of `SessionShape.channels` should use, so the short
 * and long forms cannot be read differently anywhere.
 *
 * `main` comes first and always exists, declared or not: it is the session's
 * default channel, so a genre that lists only `manuscript` still has it. A
 * genre that *does* declare `main` gets its own declaration in that first
 * position rather than a second row.
 *
 * What "resolved" means, per entry: `role` is always present; `voice` is the
 * channel's, else the genre's, else absent; `messageVerbs` is the genre's
 * with the channel's declared keys over the top, absent when neither declares
 * any; `turnControls` the same, over the genre's `turnControls`; `label` a
 * locale map, absent when undeclared. So the answer read off an entry is the
 * effective one, and no caller has to remember the inheritance.
 *
 * Takes `unknown` for the same reason `resolveWrites` does, and never throws:
 * a shape from a stored registry row is data. An unreadable entry is skipped
 * rather than guessed at — the refusal belongs at the declaration
 * (`assertChannelDecls`), not at a read on the turn's path.
 * @experimental
 */
export function channelDecls(shape: unknown): ChannelDecl[] {
	const s = (shape && typeof shape === 'object' ? shape : {}) as {
		channels?: unknown
		voice?: unknown
		messageVerbs?: SessionShape['messageVerbs']
		turnControls?: SessionShape['turnControls']
	}
	const genreVoice = typeof s.voice === 'string' ? (s.voice as ChannelVoice) : undefined
	const genreVerbs = s.messageVerbs
	const genreControls = plainObject(s.turnControls)
	const resolve = (raw: unknown): ChannelDecl | undefined => {
		const decl: Partial<ChannelDecl> =
			typeof raw === 'string'
				? { slug: raw.trim() }
				: raw && typeof raw === 'object' && !Array.isArray(raw)
					? (raw as ChannelDecl)
					: {}
		const slug = typeof decl.slug === 'string' ? decl.slug.trim() : ''
		if (!slug) return undefined
		const verbs =
			decl.messageVerbs || genreVerbs ? { ...genreVerbs, ...decl.messageVerbs } : undefined
		const ownControls = plainObject(decl.turnControls)
		const controls =
			ownControls || genreControls ? { ...genreControls, ...ownControls } : undefined
		return {
			slug,
			role: decl.role ?? 'conversation',
			...(decl.voice ?? genreVoice ? { voice: decl.voice ?? genreVoice } : {}),
			...(verbs ? { messageVerbs: verbs } : {}),
			...(isI18n(decl.label) ? { label: localeMapOf(decl.label) } : {}),
			...(controls ? { turnControls: controls as SessionShape['turnControls'] } : {}),
		}
	}
	const declared = (Array.isArray(s.channels) ? s.channels : [])
		.map(resolve)
		.filter((d): d is ChannelDecl => d !== undefined)
	const main = declared.find((d) => d.slug === DEFAULT_CHANNEL)
	return [main ?? resolve(DEFAULT_CHANNEL)!, ...declared.filter((d) => d !== main)]
}

/**
 * A channel declaration that cannot mean what it says is refused — with a
 * sentence, at the declaration, on the same terms as `assertMessageVerbFloors`.
 *
 * `main` may only be a conversation: it is the channel every session has and
 * the one a turn lands on by default, so a genre that made it a document
 * would leave the session with nowhere to talk.
 * @experimental
 */
export function assertChannelDecls(shape: SessionShape | undefined, who: string): void {
	const channels = shape?.channels as unknown
	if (channels === undefined) return
	if (!Array.isArray(channels))
		throw new Error(
			`${who} declares a 'channels' that is not an array. A genre's channels are a list ` +
				`of slugs, each a bare string or a { slug, role?, voice?, messageVerbs?, label?, turnControls? } (R-C).`,
		)
	for (const raw of channels) {
		const isString = typeof raw === 'string'
		if (!isString && (!raw || typeof raw !== 'object' || Array.isArray(raw)))
			throw new Error(
				`${who} declares a channel that is neither a slug nor a declaration: ` +
					`${JSON.stringify(raw)}. Each channel is a bare string or a ` +
					`{ slug, role?, voice?, messageVerbs?, label?, turnControls? } (R-C).`,
			)
		const decl = (isString ? { slug: raw } : raw) as ChannelDecl
		const slug = typeof decl.slug === 'string' ? decl.slug.trim() : ''
		if (!slug)
			throw new Error(
				`${who} declares a channel with no slug. A channel is named by the slug it is ` +
					`referenced and stored under (R-C).`,
			)
		if (slug.includes(':'))
			throw new Error(
				`${who} declares the channel '${slug}'. A channel is declared by its slug alone — ` +
					`lanes under it are runtime and open-ended, allocated by this genre's ` +
					`pipelines, and no lane count is declared anywhere (ruling 2026-09-09).`,
			)
		const at = `${who} channel '${slug}'`
		if (decl.role !== undefined && !CHANNEL_ROLES.includes(decl.role))
			throw new Error(
				`${at} declares role '${decl.role}'. A channel's role is ` +
					`${CHANNEL_ROLES.map((r) => `'${r}'`).join(' or ')} — how its messages enter a ` +
					`prompt, turns with speakers or one block of text (R-C).`,
			)
		if (decl.voice !== undefined && !CHANNEL_VOICES.includes(decl.voice))
			throw new Error(
				`${at} declares voice '${decl.voice}'. A channel's voice is ` +
					`${CHANNEL_VOICES.map((v) => `'${v}'`).join(', ')} — whose name a turn ` +
					`triggered here seeds under, or none for no seed row at all (R-C).`,
			)
		assertMessageVerbFloors({ messageVerbs: decl.messageVerbs }, at)
		// R6: the display name is display text, and the per-channel turn
		// controls are judged on exactly the terms the genre's are.
		const label = i18nFindings(decl.label, `${at} label`)
		if (label.length) throw new Error(label.join('\n'))
		assertTurnControls({ turnControls: decl.turnControls } as SessionShape, at)
		if (slug === DEFAULT_CHANNEL && (decl.role ?? 'conversation') !== 'conversation')
			throw new Error(
				`${at} is declared role '${decl.role}'. '${DEFAULT_CHANNEL}' is the channel every ` +
					`session has and the one a turn lands on by default, so it is always a ` +
					`conversation; declare another channel for the folio (R-C).`,
			)
	}
}


/** @experimental */
export interface Descriptor<
	Out extends PortDecl = PortDecl,
	In extends PortDecl = PortDecl,
	Id extends string = string,
> {
	/**
	 * `namespace:kind/name@N` — and the `@N` is the **type** version, which is a pin
	 * (01 §3). Distinct from a spec's semver, which is an upgrade key (src/identity.ts).
	 * Carried in the type so a pinned constructor can expose `.v1()` at the call site.
	 */
	id: Id
	kind: Kind
	i18n?: { name?: I18n; description?: I18n }
	slots?: Record<string, SlotDecl>
	ports: { in?: In; out?: Out }

	/** Oracle/outlet only — the review gate keys on this, not on kind (01 §7). */
	effects?: 'none' | 'external' | 'write' | 'emit'
	/**
	 * An author may default review **on** for their own node. There is no value here
	 * that forbids it — that is the enforcement, not a rule someone checks (F14).
	 *
	 * **Policy**, not contract (`DESCRIPTOR_POLICY_KEYS`): where the gate
	 * starts is offered to the person who configures the node, and moving it
	 * changes no port, shape or behaviour of the node itself.
	 */
	reviewDefault?: ReviewPosition
	/**
	 * Which of this node's in-ports a reviewer may **edit** at the gate (R-15,
	 * U5b review C1, 2026-09-16): an allow-list of port names. Absent, the
	 * form is inferred from the whole payload the node received, as it always
	 * was — every field editable. Declared, the form shows these fields and
	 * no other, and a decision that submits any other key is refused with a
	 * sentence rather than folded in silently.
	 *
	 * The case it exists for is an **identity** field: the `target` of a
	 * delete, the `fromMessage` of a branch, the `index` of a swipe. The
	 * handler judged whether THIS person may act on THIS row before the run
	 * started; a form that let the reviewer retype the id re-aimed a write
	 * that had already passed that check, at a row it never saw. So an
	 * effectful definition whose payload names a row declares what may
	 * change — the text, the direction, the title — and the id is never
	 * among them. `fields: []` is a legitimate declaration: approve or
	 * reject, nothing to edit (a delete).
	 *
	 * **Contract** (`DESCRIPTOR_CONTRACT_KEYS`, plans/31 V6): `fields` is the
	 * list a decision is validated against, so a pinned spec's review form
	 * and the keys its decisions may carry run against it — widening or
	 * narrowing the list moves the hash.
	 *
	 * Read from the in-process definition, and carried on the registry row
	 * (`RegistryEntry.review`) so a `transport: process` plugin outlet's form
	 * can be read without loading the plugin.
	 */
	review?: { fields: readonly string[] }
	/** Connection kind for providers (== produced shape). Contract. */
	shape?: ShapeId
	/**
	 * May this node be switched off? Requires shape transparency (01 §14
	 * F-toggleable). **Policy** — what the panel offers; the switch itself is
	 * a setting, and the node runs the same either side of it.
	 */
	toggleable?: boolean
	/**
	 * Producing nothing is a legitimate outcome, so failing is not the run's
	 * failure.
	 *
	 * An `err` — including a timeout — becomes an empty `ok` and the run
	 * continues. The receipt still records what went wrong: `result` stays
	 * `err`, `reason` keeps the message, and `recoveredAsEmpty` marks it, so
	 * this is *tolerated* rather than hidden. A node whose failure nobody can
	 * see is worse than one that stops the run.
	 *
	 * For enrichment a template already guards with `{{#if}}` — the narrative
	 * graph's relationship summary is the case this exists for: a slow read of
	 * an optional block should never cost somebody their reply. It does **not**
	 * license wiring a required input to an optional node; downstream still has
	 * to mean something when the value is absent, which is a property of the
	 * ports, not of this flag.
	 *
	 * Deliberately not `halt` or `cancelled`. A halt is a binding saying "stop
	 * here" on purpose (a preview, a review gate) and a cancellation is the
	 * user; neither is a failure to absorb.
	 *
	 * **Contract**: the ports do not move when it flips, but every spec pinning
	 * the version changes behaviour on failure.
	 */
	optional?: boolean
	/**
	 * Declares it consumes the run seed — keeps Tasks pure (F11). **Contract**:
	 * a replay with the same seed is only a replay while the set of nodes
	 * drawing on it is the set the document was compiled against.
	 */
	declaresRandomness?: boolean
	/**
	 * Declared, not bound (plans/29 R-2, 2026-09-17).
	 *
	 * A definition core publishes because a plan owns it — `speak` (plans/14),
	 * the two MCP oracles (plans/28) — while no handler implements it yet. The
	 * flag is what stops the gap from being invisible: the registry row reads
	 * `status: 'provisional'` and is badged; every listing that OFFERS
	 * definitions leaves it out; `validate()` refuses a document placing it
	 * (law R-2, *bind it or remove the node*); and the executor refuses to run
	 * the node with the same sentence, so a document that reached it by another
	 * door halts legibly rather than on "no binding registered".
	 *
	 * **Policy, never hashed** (plans/31 V6, 2026-09-17 — reversing U6's
	 * choice): what is *offered* is policy and what *runs* is contract, and
	 * this flag decides only the first. The day the handler lands the pin
	 * stays where it is; the registry row's `status` moves from
	 * `provisional` to `live` on the next sync, and the receipts that named
	 * the hash still describe the same contract. `true` or absent, never
	 * `false`: a definition is either provisional or it is not.
	 */
	provisional?: true
	/**
	 * Interior script points (18 §4e): named moments *inside* the binding's
	 * work where user text-transform chains may run — a drafting loop's
	 * intermediate texts. Declared here so "which nodes can run scripts, and
	 * where" is answerable from the document; the binding invokes one with
	 * `ctx.scripts.applyText(key, text)` and gets no `ctx.scripts` at all
	 * without a declaration. **Part of the hashed contract** — a point
	 * appearing or vanishing, or what it `accepts`, changes what an untouched
	 * spec's configuration can reach (S3's argument, one construct over).
	 * `label`/`description` are display text and stripped from the hash as
	 * everywhere.
	 *
	 * A point declares what it **accepts** (R-11, ruled 2026-09-15; 18 §4e):
	 * the executor hands that list to the applier, which refuses a link of any
	 * other kind — it hardcoded `text/transform` until 2026-09-16. Read the
	 * list through `scriptPointsOf`. A bare-string point (`'each-draft'`) is
	 * refused at `register()` — the spelling was retired without an alias.
	 */
	scriptPoints?: ScriptPointDecl[]
	/**
	 * The chat-shape contract (19 §0–§1) — present **only on input types**,
	 * and its presence is what makes the input type a **chat mode**. The mode
	 * id is this type's id; any spec pinning it and matching the primary-write
	 * signature is in the mode's bucket, by construction.
	 *
	 * The core idea is **capability references**: the shape names the systems
	 * of core it uses, and declaring one is what enables that system's UI,
	 * storage and query satisfiability for chats of the mode. A capability the
	 * shape does not declare does not exist for the chat — no toggles, no
	 * rows, no budget spent retrieving for it. `personas` absent or `max: 0`
	 * means the user is prose: nameless text, no identity, a first-class
	 * state rather than an edge case.
	 *
	 * **Hashed contract** (display lives in `i18n` as everywhere): widening
	 * `characters.max` changes what existing sessions legally contain — the
	 * `optional` lesson, again. `fields` reuses `SettingsSchema` — the
	 * one-field-language rule — rendered in session settings and supplied back
	 * through this input's published document. Duties and triggers are
	 * deliberately NOT here: the shape is owner-only, and event functions
	 * beyond the intrinsic composer are contributed by the specs that serve
	 * them (19 §3–§4), so a mode never has to know its narrator exists.
	 *
	 * Named `sessionShape` because `shape` was already taken by the provider
	 * connection kind above — renaming *that* would re-hash every provider
	 * on the instance for a word.
	 */
	sessionShape?: SessionShape
	/**
	 * May finish before an upstream stream ends (01 §11). **Contract**: a
	 * stream consumer that may return early and one that must drain are two
	 * different things to wire a stream into.
	 */
	earlyExit?: boolean
	/**
	 * Public pipeline hooks may be pinned by any spec (01 §9b). **Policy**:
	 * who may pin it is decided at install, not run — a spec that already
	 * pins it runs against the same contract either way.
	 */
	public?: boolean
	/**
	 * F36 — every hook invocation is bounded. **Policy**, both of them: how
	 * long the host waits is the host's to tune, and a spec's document is
	 * indifferent to it.
	 */
	timeoutMs?: number
	timeoutKind?: 'wall' | 'idle'
	/**
	 * Which core event a write causes. Declared here, never per spec (01 §8).
	 * Refused at registration unless that event's `causedBy` names this
	 * definition (R33): `EventDef.causedBy` is the one authored statement of
	 * what causes what, and this field must agree with it.
	 */
	causesEvent?: string
	/**
	 * The in-port whose literal names the event a write causes, when that is
	 * decided per node rather than per definition — `record-event`'s `event`. The event must be one a package declared; the receipt records it
	 * like any `causesEvent`. Never both on one definition.
	 */
	causesEventFrom?: string
	/**
	 * Inlet only (R33, PLAN-turn-order §4.14): the event payload shapes this
	 * inlet reads. A spec may lock one inlet to several events (`{ genre,
	 * events }`) only when every listed event's `payload` is here; an inlet
	 * that declares none answers one event. `core:inlet/session-event@1`
	 * declares the session payloads.
	 */
	payloads?: ShapeId[]
	/**
	 * Outlet only: the row this outlet commits becomes the run's **live row**
	 * (R-21 (2)) — where core routes an oracle's stream, and what Stop
	 * finalises when a run is cancelled with nothing left to run.
	 *
	 * Declared rather than inferred from the event the write causes, because
	 * two outlets can cause `message-created` and only one of them makes a
	 * row a stream should land in: a greeting seed writes several messages
	 * and none of them is anybody's placeholder. **Contract**: where the
	 * stream lands is a property of the wiring the document was compiled
	 * against.
	 *
	 * The declaration says the outlet *can* open the live row; a write opens
	 * it only when it is a row still being written — its `generating` in-port
	 * fed truthy, or its `row` in-port claiming an existing row
	 * (`LIVE_ROW_PORTS`, `opensLiveRow`). A complete message written by the
	 * same outlet is an ordinary write (F7, W1).
	 */
	liveRow?: boolean
	/**
	 * Where an oracle's token usage sits on its response — a dotted path a
	 * host may read for the receipt. **Policy**: it could only change what a
	 * receipt reports, never what the node produces.
	 */
	usage?: string
	/**
	 * Which media kinds this type can take in and give out.
	 *
	 * Declared rather than inferred from ports, because the ports are
	 * deliberately general: one `media-ref` shape carries every kind, so the
	 * port says *that* media flows here and this says *which*. That split is
	 * what keeps a new modality from being a new shape, new ports and a new
	 * branch in every wire adapter, while still letting a picker grey out a
	 * connection that cannot read PDFs.
	 *
	 * A **type** declaring `accepts` says the contract has somewhere to put
	 * media. Whether a given *connection* behind it actually does is a runtime
	 * capability the adapter reports — same shape, same field name, resolved
	 * against this at bind time. A spec that wires an image into a connection
	 * whose model is text-only should fail where the user can see it, not at
	 * the provider's HTTP call.
	 *
	 * **Contract**: it decides what a document may wire into the node's media
	 * ports, which is what a bind-time refusal is checked against.
	 */
	media?: MediaCapability
	/**
	 * The entry-row contract — present **only on entry types**, and its
	 * presence is what makes one (`describeEntryType` is the only door that
	 * sets it).
	 *
	 * Named `entryShape` on the same terms as `sessionShape`: `shape` above is
	 * already the provider connection kind, and the two facts are unrelated.
	 * Hashed, whole — see the note on `EntryShape`.
	 */
	entryShape?: EntryShape
	/**
	 * The bands this source publishes, each with the variable that lays it out
	 * (typed templates P2, 2026-09-27) — `{ secretEntry: varSecretEntry }`.
	 *
	 * A band is the ranker's word for one source's slice of the window, named
	 * at the head of the source's candidates (`bandIntent`). Declared here, it
	 * is also a **top-level template name**: Assemble renders it as
	 * `{{{secretEntry}}}` through the variable's selected layout, and its
	 * `variables` slot offers that layout as a setting (`rendersBands`).
	 *
	 * Keys are identifiers; the variable is registered and its scope declares
	 * the key; a key never shadows a name core renders or means two things —
	 * each refused at registration with the fix (`checkBandDeclarations`). A
	 * band a source emits and does not declare is still ranked and budgeted,
	 * reaches no template name, and is named on the receipt with the fix.
	 *
	 * **Contract** (`DESCRIPTOR_CONTRACT_KEYS`, owner ruling 2026-09-27): it
	 * decides what a template may reference, so a plugin update that changes
	 * which bands a step produces moves the hash — hashed as `{ key:
	 * variableId }`, key order ignored. It still rides the registry row's
	 * `policy` as `{ key: variableId }`, so a host reads a plugin's bands
	 * without loading the plugin (F6), and `definitionContract` reads it back
	 * from there to the same hash.
	 * @experimental
	 */
	bands?: Record<string, VariableDecl>
	/**
	 * Which out-ports carry each declared band — `{ recalledLines: ['messages'] }`.
	 * A band not named here is carried on every out-port, which is what every
	 * single-port source means.
	 *
	 * Needed by a source publishing different bands on different ports:
	 * `core:query/entity-search@1` puts lore on `main` and recalled lines on
	 * `messages`, and a spec wiring only `main` must not offer a template
	 * `{{{recalledLines}}}` that can never fill. `bandsReaching` follows it;
	 * each key must be a declared band and each port a declared out-port
	 * (`checkBandDeclarations`).
	 *
	 * **Contract**, beside `bands` and for its reason: it decides which bands
	 * reach a template. Rides the registry row's `policy` verbatim.
	 * @experimental
	 */
	bandPorts?: Record<string, readonly string[]>
	/**
	 * What each out-port's payload looks like, in the template type language
	 * (typed templates P1) — `{ out: { templateContext: { type: 'object', … } } }`.
	 *
	 * A port says which shape flows; this says what is inside it, which is what
	 * a template editor needs to offer `{{ templateContext.char }}` with a type.
	 * Optional and additive: a port without one is `'any'`, as every port was.
	 *
	 * **Contract** (owner ruling 2026-09-27): what a template reading the port
	 * may reference, so changing it moves the hash (display text stripped, as
	 * in the slots). Like `bands`, it rides the row's `policy` verbatim and is
	 * hashed from there.
	 * @experimental
	 */
	portSchemas?: { out?: Record<string, VarField> }
}

const types = new Map<string, Descriptor>()

/**
 * A descriptor's display text, beyond the `i18n`/`description` pair every
 * declaration carries.
 *
 * `label` is what settings.ts calls the canonical key for a field or a member
 * band — `i18n` there is its deprecated alias — and those sit two levels down
 * inside `slots[].schema` and `entryShape.fields`. Renaming "Top K" was
 * therefore a hash change, which is exactly the edit src/hash.ts promises will
 * not put the reload loop back.
 *
 * ⚠ `title` is deliberately absent. `WidgetDecl.title` is a heading, but
 * `EntryRoles.title` is which field the engine reads as a row's title —
 * contract, and moving one is an `@N+1` on purpose. One word, two answers, both
 * reachable from here, so a key-name rule cannot have it both ways; the panel
 * heading stays hashed until one of them is renamed.
 *
 * ## Where it is read
 *
 * Inside `definitionContract`, on every contract field that can carry a
 * label — `slots`, `scriptPoints`, `sessionShape`, `entryShape`. The
 * re-declaration guard below and core's `pipeline_definition_registry`
 * projection both hash through that one function, so there is no second list
 * to keep in step; the value is exported for the tests that prove the strip
 * holds at every depth. Adding a word here re-hashes every definition that
 * carries it — a pointer move on every install, exactly as adding one to
 * `UNIVERSAL_DISPLAY` would be.
 * @internal
 */
export const DESCRIPTOR_DISPLAY_KEYS: DisplayKeys = { display: ['label'] }

/**
 * The two halves of a `Descriptor` (plans/31 V6, ruled 2026-09-17).
 *
 * **Contract** is what a pinned spec runs against: the ports and shapes a
 * document was compiled against, the slots it configures and their schema,
 * the effects the gate keys on, the fields a reviewer's decision may carry,
 * whether the node may fail empty, return early, draw on the seed, hold the
 * live row, cause an event, take media. It is what `definitionContractHash`
 * digests, and that hash is what a registry row's pointer and a run's receipt
 * name — so moving any of it republishes the slug on every install.
 *
 * **Policy** is what is *offered* or *shown*: whether the definition is
 * listed (`provisional`, `public`), where its gate starts, whether the panel
 * offers a switch, how long the host waits, what the receipt reads, what the
 * node is called. It lives on the registry row (`RegistryEntry.policy`,
 * `i18n`, `public`) and is never hashed: flipping any of it leaves every pin
 * where it is and takes effect on the next sync — and on the next hot reload,
 * since the registry replaces a re-declaration whose contract is unchanged.
 *
 * Every `Descriptor` key is in exactly one list. `DescriptorFieldsClassified`
 * below makes a key in neither — or in both — a compile error, so a new field
 * is classified before it exists; `sdk-tests/contract.test.ts` gives the
 * one-line reason per field.
 * @experimental
 */
export const DESCRIPTOR_CONTRACT_KEYS = [
	'id',
	'kind',
	'ports',
	'slots',
	'effects',
	'review',
	'shape',
	'optional',
	'declaresRandomness',
	'scriptPoints',
	'sessionShape',
	'earlyExit',
	'causesEvent',
	'causesEventFrom',
	'payloads',
	'liveRow',
	'media',
	'entryShape',
	'bands',
	'bandPorts',
	'portSchemas',
] as const satisfies readonly (keyof Descriptor)[]

/** @experimental */
export const DESCRIPTOR_POLICY_KEYS = [
	'i18n',
	'reviewDefault',
	'toggleable',
	'provisional',
	'public',
	'timeoutMs',
	'timeoutKind',
	'usage',
] as const satisfies readonly (keyof Descriptor)[]

/** @experimental */
export type DescriptorContractKey = (typeof DESCRIPTOR_CONTRACT_KEYS)[number]
/** @experimental */
export type DescriptorPolicyKey = (typeof DESCRIPTOR_POLICY_KEYS)[number]

type IsNever<T> = [T] extends [never] ? true : false
/**
 * `true` — and `never`, so the constant below stops compiling, the day a
 * `Descriptor` field is in neither list or in both. Nothing reads either;
 * the type error is the point.
 * @experimental
 */
export type DescriptorFieldsClassified = [
	IsNever<Exclude<keyof Descriptor, DescriptorContractKey | DescriptorPolicyKey>>,
	IsNever<Extract<DescriptorContractKey, DescriptorPolicyKey>>,
] extends [true, true]
	? true
	: never
/** @experimental */
export const DESCRIPTOR_FIELDS_CLASSIFIED: DescriptorFieldsClassified = true

/**
 * The policy half of a definition as a registry row carries it
 * (`RegistryEntry.policy`): the `Descriptor` fields that are policy and have
 * no column of their own. `i18n` and `public` are policy too and project to
 * their own columns; `usage` is read by no row reader and is not carried.
 * Mutable by design — a sync refreshes it in place, the hash never sees it —
 * with one exception: `bands` and `portSchemas` are contract carried here
 * (owner ruling 2026-09-27), so the row needs no column for them, and
 * `definitionContract` hashes them from here.
 * @experimental
 */
export interface DefinitionPolicy {
	provisional?: true
	reviewDefault?: ReviewPosition
	timeoutMs?: number
	timeoutKind?: 'wall' | 'idle'
	toggleable?: boolean
	/** The bands a source declares, as `{ key: variableId }` — `Descriptor.bands`, by id. */
	bands?: Record<string, string>
	/** `Descriptor.bandPorts`, keys and ports sorted. */
	bandPorts?: Record<string, string[]>
	/** `Descriptor.portSchemas`, verbatim. */
	portSchemas?: { out?: Record<string, VarField> }
}

/** A definition's policy, projected — `undefined` keys dropped so a row and a re-read agree. @experimental */
export function definitionPolicy(d: {
	provisional?: true
	reviewDefault?: ReviewPosition
	timeoutMs?: number
	timeoutKind?: 'wall' | 'idle'
	toggleable?: boolean
	bands?: Record<string, VariableDecl | string>
	bandPorts?: Record<string, readonly string[]>
	portSchemas?: { out?: Record<string, VarField> }
}): DefinitionPolicy {
	const policy: DefinitionPolicy = {}
	if (d.provisional === true) policy.provisional = true
	if (d.reviewDefault !== undefined) policy.reviewDefault = d.reviewDefault
	if (d.timeoutMs !== undefined) policy.timeoutMs = d.timeoutMs
	if (d.timeoutKind !== undefined) policy.timeoutKind = d.timeoutKind
	if (d.toggleable !== undefined) policy.toggleable = d.toggleable
	// By id: the row carries which variable, and the registry says the rest.
	// Sorted, so a row and a re-read agree whatever order the author wrote.
	if (d.bands && Object.keys(d.bands).length)
		policy.bands = Object.fromEntries(
			Object.entries(d.bands)
				.map(([k, v]) => [k, typeof v === 'string' ? v : v.id] as const)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
		)
	const bandPorts = bandPortsMaterial(d.bandPorts)
	if (bandPorts) policy.bandPorts = bandPorts
	if (d.portSchemas !== undefined) policy.portSchemas = d.portSchemas
	return policy
}

/**
 * What `definitionContract` reads. A `Descriptor` satisfies it, and so does a
 * `RegistryEntry` — the same declaration from the other end of the table,
 * where the id is bare beside a `version`, the ports are shape ids, the
 * substrate's `settings` slot rides among the author's, and an entry type's
 * `fields` schema lives in `configSchema`. The material is the same object
 * from either, which is what lets core hash a row it read back and get the
 * hash it was written under.
 *
 * Script kinds ride the same registry rows (18 §2), so a row's `semantics` is
 * contract here too. Their own re-declaration guard (`scripts.ts`) hashes the
 * declaration whole and is not this function.
 * @experimental
 */
export interface ContractSource {
	/** `ns:kind/name@N` on a descriptor; bare beside `version` on a row. */
	id: string
	version?: number
	kind: string
	ports?: { in?: Record<string, unknown>; out?: Record<string, unknown> }
	slots?: Record<string, unknown>
	effects?: string
	review?: { fields: readonly string[] }
	shape?: string
	optional?: boolean
	declaresRandomness?: boolean
	scriptPoints?: ReadonlyArray<ScriptPointDecl>
	sessionShape?: unknown
	earlyExit?: boolean
	causesEvent?: string
	causesEventFrom?: string
	payloads?: readonly string[]
	liveRow?: boolean
	media?: unknown
	entryShape?: unknown
	/** A row's spelling of `entryShape.fields` (`RegistryEntry.configSchema`). */
	configSchema?: unknown
	/** A descriptor's bands (`VariableDecl`) — or ids, as a row's policy spells them. */
	bands?: Record<string, VariableDecl | string>
	bandPorts?: Record<string, readonly string[]>
	portSchemas?: { out?: Record<string, VarField> }
	/**
	 * A row's policy half. Never hashed — except `bands` and `portSchemas`,
	 * contract that rides here (owner ruling 2026-09-27) and is read from
	 * here when the source has no field of its own.
	 */
	policy?: {
		bands?: Record<string, string>
		bandPorts?: Record<string, readonly string[]>
		portSchemas?: { out?: Record<string, VarField> }
	} | null
	/** Script kinds only. */
	semantics?: string
}

/**
 * The hashed material of a definition — the contract, as data.
 *
 * `id` and `version` are the slug's two halves; `ports` is shape ids by port
 * name, both directions always present; `slots` is the author's, display
 * text out (`DESCRIPTOR_DISPLAY_KEYS`); `entryShape` is whole, `fields`
 * included; `scriptPoints` is the full shape `scriptPointsOf` folds to. A
 * boolean flag is `true` or absent — `false` and unset mean the same thing
 * and hash the same, which is also what lets a `NOT NULL DEFAULT false`
 * column read back to the hash it was written under. A function value is
 * not contract (`declarationData`).
 * @experimental
 */
export interface DefinitionContract {
	id: string
	version: number
	kind: string
	ports: { in: Record<string, string | undefined>; out: Record<string, string | undefined> }
	slots: Record<string, unknown>
	effects?: string
	review?: { fields: string[] }
	shape?: string
	optional?: true
	declaresRandomness?: true
	scriptPoints?: unknown
	sessionShape?: unknown
	earlyExit?: true
	causesEvent?: string
	causesEventFrom?: string
	payloads?: string[]
	liveRow?: true
	media?: unknown
	entryShape?: unknown
	/** `{ key: variableId }` — which top-level template names this source publishes. */
	bands?: Record<string, string>
	/** `{ key: ports }` — which out-ports carry a band; sorted. */
	bandPorts?: Record<string, string[]>
	/** Out-port payload schemas, display text out. */
	portSchemas?: unknown
	semantics?: string
}

/** `{ key: variableId }`, sorted by key; none and `{}` are one contract (absent). */
function bandsMaterial(bands: Record<string, VariableDecl | string> | undefined): Record<string, string> | undefined {
	if (!bands || !Object.keys(bands).length) return undefined
	return Object.fromEntries(
		Object.entries(bands)
			.map(([k, v]) => [k, typeof v === 'string' ? v : v.id] as const)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	)
}

/** `{ key: ports }`, keys and ports sorted; none and `{}` are one contract (absent). */
function bandPortsMaterial(
	bandPorts: Record<string, readonly string[]> | undefined,
): Record<string, string[]> | undefined {
	if (!bandPorts || !Object.keys(bandPorts).length) return undefined
	return Object.fromEntries(
		Object.entries(bandPorts)
			.map(([k, ports]) => [k, [...ports].sort()] as const)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	)
}

/** Out-port schemas, display text out; no declared port is the field absent. */
function portSchemasMaterial(p: { out?: Record<string, VarField> } | undefined): unknown {
	if (!p?.out || !Object.keys(p.out).length) return undefined
	return contractData({ out: p.out })
}

const contractData = (v: unknown): unknown => declarationData(v, DESCRIPTOR_DISPLAY_KEYS)
const flag = (v: boolean | undefined): true | undefined => (v === true ? true : undefined)
const portShapes = (ports: Record<string, unknown> | undefined): Record<string, string | undefined> =>
	Object.fromEntries(
		Object.entries(ports ?? {}).map(([k, v]) => [
			k,
			typeof v === 'string' ? v : ((v as { id?: string } | undefined)?.id ?? undefined),
		]),
	)

/** The contract of a definition — every `DESCRIPTOR_CONTRACT_KEYS` field, as data, and nothing else. @internal */
export function definitionContract(source: ContractSource): DefinitionContract {
	const at = source.id.lastIndexOf('@')
	const pinned = at > 0 && /^\d+$/.test(source.id.slice(at + 1))
	const entryShape =
		source.entryShape && typeof source.entryShape === 'object'
			? {
					...(source.entryShape as Record<string, unknown>),
					...(source.configSchema !== undefined ? { fields: source.configSchema } : {}),
				}
			: undefined
	return {
		id: pinned ? source.id.slice(0, at) : source.id,
		version: source.version ?? (pinned ? Number(source.id.slice(at + 1)) : 1),
		kind: source.kind,
		ports: { in: portShapes(source.ports?.in), out: portShapes(source.ports?.out) },
		slots: contractData(authoredSlots(source.slots)) as Record<string, unknown>,
		effects: source.effects,
		review: source.review ? { fields: [...source.review.fields] } : undefined,
		shape: source.shape,
		optional: flag(source.optional),
		declaresRandomness: flag(source.declaresRandomness),
		scriptPoints: source.scriptPoints ? contractData(scriptPointsOf(source)) : undefined,
		sessionShape: contractData(source.sessionShape),
		earlyExit: flag(source.earlyExit),
		causesEvent: source.causesEvent,
		causesEventFrom: source.causesEventFrom,
		// Sorted: which payloads an inlet reads is a set, not a sequence.
		payloads: source.payloads?.length ? [...source.payloads].sort() : undefined,
		liveRow: flag(source.liveRow),
		media: contractData(source.media),
		entryShape: contractData(entryShape),
		// Contract that rides the row's policy (owner ruling 2026-09-27): a
		// descriptor's own field, else the row's policy spelling — one hash.
		bands: bandsMaterial(source.bands ?? source.policy?.bands ?? undefined),
		bandPorts: bandPortsMaterial(source.bandPorts ?? source.policy?.bandPorts ?? undefined),
		portSchemas: portSchemasMaterial(source.portSchemas ?? source.policy?.portSchemas ?? undefined),
		semantics: source.semantics,
	}
}

/**
 * The content hash of a definition — a digest of `definitionContract`, and
 * the one answer to *is this the same definition?* The registry guard below,
 * core's `pipeline_definition_registry` pointer and a run's receipt all name
 * this string.
 * @internal
 */
export function definitionContractHash(source: ContractSource): string {
	return contentHash(definitionContract(source))
}

function register<D extends Descriptor<any, any, any>>(d: D): D {
	// Contract, not arrival (src/hash.ts): a re-declaration whose contract is
	// unchanged replaces the entry — policy and display text are the fresher
	// author's — and one whose contract moved is refused with both hashes.
	// Only computed when there is something to compare against, so the
	// ordinary path costs nothing.
	const existing = types.get(d.id)
	if (existing)
		refuseUnlessSameHash(
			definitionContractHash(existing),
			definitionContractHash(d),
			`duplicate type id: ${d.id}`,
		)
	checkWritePublishes(d as Descriptor)
	checkNoAuthoredSettings(d as Descriptor)
	checkNoSettingsPort(d as Descriptor)
	checkScriptPointsAccept(d as Descriptor)
	checkCausesEvent(d as Descriptor)
	checkNoAmbientExtras(d as Descriptor)
	// Before the id is claimed, so a refused declaration can be fixed and retried.
	checkModeTitled(d as Descriptor)
	checkDisplayText(d as Descriptor)
	// Bands (typed templates P2): identifier keys, a registered variable whose
	// scope names the key, and one meaning per key across every definition.
	checkBandDeclarations(d as Descriptor, types.values())
	assertMessageVerbFloors((d as Descriptor).sessionShape, d.id)
	assertSessionWrites((d as Descriptor).sessionShape, d.id)
	assertTurnControls((d as Descriptor).sessionShape, d.id)
	assertChannelDecls((d as Descriptor).sessionShape, d.id)
	// A finding, not a refusal: the fallback is documented (inference), the
	// omission is recorded, and `validate()` says it on every placement.
	const reviewFinding = reviewFieldsFinding(d as Descriptor)
	if (reviewFinding) registrationFindings.set(d.id, [reviewFinding])
	else registrationFindings.delete(d.id)
	types.set(d.id, d as Descriptor)
	return d
}

/**
 * The extras every script site is offered, whatever its slot lists (R32,
 * PLAN-turn-order §4.14): `session`, the run's settings document. The
 * executor supplies them at every site — a slot's port hook and an interior
 * point alike — so a slot's `extras` names only what is particular to it,
 * and listing an ambient one is refused (one way to say it, R26).
 * @internal
 */
export const AMBIENT_SCRIPT_EXTRAS = ['session'] as const

function checkNoAmbientExtras(d: Descriptor): void {
	for (const [name, slot] of Object.entries(d.slots ?? {})) {
		const listed = (slot as { extras?: readonly string[] }).extras ?? []
		const ambient = listed.filter((e) => (AMBIENT_SCRIPT_EXTRAS as readonly string[]).includes(e))
		if (ambient.length)
			throw new Error(
				`${d.id}: slot '${name}' lists ${ambient.map((e) => `'${e}'`).join(', ')} in its extras — ` +
					`every script site is handed ${AMBIENT_SCRIPT_EXTRAS.map((e) => `'${e}'`).join(', ')} already (R32); drop it from the list`,
			)
	}
}

/** `{ a: shape, … }` as one comparable line, so a misfit names the ports. */
const portLine = (ports: Record<string, unknown> | undefined): string =>
	Object.entries(ports ?? {})
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}: ${String(v)}`)
		.join(', ')

// Authored slots only: the registry adds the substrate `settings` slot to
// every definition (R-9), which a raw declaration does not carry (M4).
const slotLine = (slots: Record<string, unknown> | undefined): string =>
	Object.keys(authoredSlots(slots as never) ?? {}).sort().join(', ')

/**
 * Can `swap` stand in for `pinned` at node `key` (R28)? A swap is seated with
 * the pin's node config, so it must be the same kind with the same in- and
 * out-ports (by name and shape) and the same slots — a slot the pin's node
 * does not wire would never reach the swap, and a person would pick an
 * option that silently ignores its own settings. Script points are free: a
 * chain is configured on the node key, whatever sits there. One sentence
 * for the builder and the package pass alike.
 * @experimental
 */
export function swapFitFinding(
	key: string,
	pinned: Pick<Descriptor, 'id' | 'kind' | 'ports' | 'slots'>,
	swap: Pick<Descriptor, 'id' | 'kind' | 'ports' | 'slots'> & { provisional?: true },
): string | undefined {
	// A provisional definition has no handler (plans/29 R-2): offering it
	// would put an option in front of a person that cannot run.
	if ((swap as { provisional?: true }).provisional)
		return `'${swap.id}' cannot stand in for '${key}': it is provisional — declared, with no handler to run`
	// Plugins are blind to connections (R53): a node that uses one is one only
	// core's code can stand in for, whatever the fit.
	const usesConnection = Object.values(pinned.slots ?? {}).some(
		(slot) => (slot as { kind?: unknown } | undefined)?.kind === 'connection',
	)
	if (usesConnection && !swap.id.startsWith('core:'))
		return (
			`'${swap.id}' cannot stand in for '${key}': that node uses a connection, and a plugin's code never ` +
			`touches connection data or calls a model (R53) — shape the core node with prompts or a config instead` +
			pluginRuleRef('connections')
		)
	const want = `a ${pinned.kind} with in { ${portLine(pinned.ports?.in)} } → out { ${portLine(pinned.ports?.out)} } and slots [${slotLine(pinned.slots)}]`
	const got = `a ${swap.kind} with in { ${portLine(swap.ports?.in)} } → out { ${portLine(swap.ports?.out)} } and slots [${slotLine(swap.slots)}]`
	return want === got
		? undefined
		: `'${swap.id}' cannot stand in for '${key}': a swap must match the pin's kind, ports and slots — ${want}; it is ${got}`
}

/**
 * Can one inlet answer every event of an `events` lock (R33)? Each listed
 * event must carry a payload the inlet declares it reads; an inlet that
 * declares none answers one event only. One sentence for the builder and
 * the package pass alike.
 * @experimental
 */
export function eventsLockFindings(
	inlet: Pick<Descriptor, 'id' | 'payloads'>,
	events: readonly string[],
): string[] {
	const reads = inlet.payloads ?? []
	if (!reads.length)
		return [
			`'${inlet.id}' declares no payloads, so it answers one event: { genre, event }. ` +
				`A spec answering several events uses an inlet that reads them all — ` +
				`core:inlet/session-event@1 (PLAN-turn-order §4.14)`,
		]
	const out: string[] = []
	for (const e of events) {
		const shape = eventById(e)?.payload
		if (!eventById(e)) continue // refused by the lock's own event check, in its own words
		if (!shape)
			out.push(
				`'${e}' carries no payload, so it cannot share an inlet with other events — lock it alone: { genre, event }`,
			)
		else if (!reads.includes(shape))
			out.push(
				`'${inlet.id}' does not read '${shape}', the payload of '${e}' — it reads ${reads.map((r) => `'${r}'`).join(', ')}`,
			)
	}
	return out
}

/**
 * `causesEvent` agrees with the event's own `causedBy` (R33). The event side
 * is the complete statement — `message-completed` is caused by three writes
 * whose own `causesEvent` names their primary event — so this field may only
 * name an event that already lists the definition. And only core defines
 * events (R30, F8): a package's outlet cannot cause one.
 */
function checkCausesEvent(d: Descriptor): void {
	if (d.causesEventFrom !== undefined) {
		if (d.kind !== 'outlet' || d.effects !== 'write')
			throw new Error(`'${d.id}' declares causesEventFrom — only a write outlet causes an event`)
		if (d.causesEvent)
			throw new Error(`'${d.id}' declares both causesEvent and causesEventFrom — one says which event, not both`)
		if (!d.ports.in?.[d.causesEventFrom])
			throw new Error(`'${d.id}' names causesEventFrom '${d.causesEventFrom}', which is not one of its in-ports`)
		return
	}
	if (!d.causesEvent) return
	const event = eventById(d.causesEvent)
	if (!event) throw new Error(`${d.id}: ${notADeclaredEvent(d.causesEvent)}`)
	const base = d.id.replace(/@\d+$/, '')
	if (!event.causedBy?.includes(base))
		throw new Error(
			`'${d.id}' causes '${d.causesEvent}', but that event's causedBy does not name '${base}'. ` +
				`causedBy is the one statement of what causes what — add '${base}' there, or drop causesEvent (R33)`,
		)
}

/**
 * A gate-eligible write publishes `write-result@1`, never raw ids (13 §7j-b).
 *
 * Checked at registration rather than reviewed by hand, because the hand-written version
 * was already wrong: three core Consumers declared `row-ids@1` out ports while declaring
 * `effects: 'write'`. Each one was a spec that could wire a downstream foreign key to a
 * row a reviewer had not approved yet — and under `async` review that row may never exist.
 * The failure lands long after the run that caused it, which is the worst kind to find by
 * reading.
 */
function checkWritePublishes(d: Descriptor): void {
	if (d.effects !== 'write') return
	const bad = Object.entries(d.ports?.out ?? {}).filter(
		([, s]) => shapeIdOf(s) === 'core:shape/row-ids@1',
	)
	if (!bad.length) return
	throw new Error(
		`${d.id} declares effects: 'write' but publishes core:shape/row-ids@1 on ` +
			`${bad.map(([k]) => `'${k}'`).join(', ')}. A gate-eligible write publishes ` +
			`core:shape/write-result@1 — pending under async review, committed otherwise — so a ` +
			`downstream port wanting raw ids fails at publish instead of writing a foreign key ` +
			`that dangles when the reviewer rejects (13 §7j-b).`,
	)
}

/**
 * `settings` is the substrate's slot, never an author's (R-9).
 *
 * Refused at registration rather than merged, because the two would collide
 * at one address: the executor reads `config[key].settings.enabled` to skip
 * an optional node and `.review` to gate a write, and an authored field of
 * the same name would be read as that switch. It is also what lets the
 * registry hash leave the projected slot out — a slot that is never authored
 * is never a change to what an author declared.
 */
function checkNoAuthoredSettings(d: Descriptor): void {
	if (!d.slots) return
	if ('settings' in d.slots)
		throw new Error(
			`${d.id} declares a slot named 'settings'. That name is reserved for the substrate's ` +
				`own slot — \`enabled\` on an optional node, \`review\` on a gated one — which the ` +
				`registry projection declares and the executor reads. Name the slot for what it ` +
				`holds ('parameters' for tunables).`,
		)
	// By kind as well as by name (U4 residual, 2026-09-16): a slot called
	// anything else but declared `kind: 'settings'` would render through the
	// substrate's branch of the panel and hash as authored material, which is
	// the same collision one address over.
	const byKind = Object.entries(d.slots).find(([, decl]) => decl?.kind === 'settings')
	if (byKind)
		throw new Error(
			`${d.id} declares slot '${byKind[0]}' with kind 'settings'. That kind is the ` +
				`substrate's — derived from \`optional\` and \`effects\`, never authored. Declare ` +
				`'parameters' for tunables.`,
		)
}

/**
 * Nor an out-port of the name (F39; U7 review, S2).
 *
 * `<nodeKey>.settings` and `<nodeKey>.settings.*` are the address the
 * validator and the executor read as the substrate's switches: a data edge
 * drawn from it is refused as a setting travelling (F39), and a reference to
 * it resolves to nothing. A definition publishing an out-port of that name
 * would have every edge from the port refused under a law about something
 * else — a port nobody could wire — so the name is refused where the author
 * is, and the F39 edge rule can never mistake a declared port for a switch.
 * `register()` is F39's registry door: `core:verdict/settings-travel` judges
 * each declared out-port and this quotes it (01 §13).
 */
function checkNoSettingsPort(d: Descriptor): void {
	for (const port of Object.keys(d.ports?.out ?? {})) {
		const heard = settingsTravelVerdict.judge({ kind: 'port', definitionId: d.id, port })
		if (!heard.ok) throw new Error(refusalText(heard))
	}
}

/**
 * A script point names the kinds it accepts (R-11; U4 residual 2026-09-16).
 * A point nothing can attach to is a control with no effect wearing a
 * contract: the panel would offer the hook and every kind would be refused
 * at it.
 */
function checkScriptPointsAccept(d: Descriptor): void {
	for (const p of d.scriptPoints ?? []) {
		const point = p as Partial<ScriptPointDecl> | string
		const key = typeof point === 'string' ? point : String(point?.key)
		const accepts = typeof point === 'string' ? undefined : point?.accepts
		if (!Array.isArray(accepts) || accepts.length === 0)
			throw new Error(
				`${d.id} declares script point '${key}' accepting no script kind. A point is ` +
					`{ key, accepts, label } — list the kinds it takes (e.g. ['core:script:text/transform@1']); ` +
					`a point that accepts nothing is a hook nothing can attach to.`,
			)
	}
}

const shapeIdOf = (s: unknown): string | undefined =>
	typeof s === 'string' ? s : ((s as { id?: string } | undefined)?.id ?? undefined)

/**
 * Is there text a person reads — a non-blank string, or a map with a non-blank
 * `en`? A map carrying only `fr` is not titled: `en` is the locale every other
 * falls back to (R-20), so a card with no `en` has no face on an English install.
 */
const hasDisplayText = (v: I18n | undefined): boolean => isI18n(v)

/**
 * A chat mode ships titled (19 §2).
 *
 * A shape-bearing input type *is* a chat mode, and the New Chat picker renders one card
 * per mode from rows — `i18n.name` is that card's face. An untitled mode could only
 * render as its type id, which is an address, not a name; refused here at declaration,
 * where the author is, rather than at install, where the admin is. A missing
 * `description` is a poorer card rather than a broken one, so the packager warns about
 * that instead of this throwing (cli/src/compiler.ts, W_MODE_NO_DESCRIPTION).
 */
function checkModeTitled(d: Descriptor): void {
	if (d.kind !== 'inlet' || !d.sessionShape) return
	if (hasDisplayText(d.i18n?.name)) return
	throw new Error(
		`${d.id} declares a sessionShape but no i18n.name. A shape-bearing input type is a ` +
			`session mode, and the New Session picker renders every mode as a card — give it a ` +
			`title: i18n: { name: { en: '…' } }. Add a description there too; the packager ` +
			`warns when a mode ships without one.`,
	)
}

/**
 * Every display string a definition declares is `I18n` (R-20; U5i, ruled
 * 2026-09-17): `i18n.name` and `i18n.description`; each slot's `description`,
 * its prompt `fields[].i18n` and its `schema` (through `settingsSchemaFindings`);
 * each script point's `label`, `description` and deprecated `i18n`; a session
 * shape's `fields` and its `panels[].title`; an entry shape's `fields`. All
 * kinds, not only a mode-bearing inlet — `checkModeTitled` keeps the one
 * strictness of its own (a mode must have a name); this refuses a blank or a
 * mis-shaped value anywhere, with the field named and the fix stated.
 */
function checkDisplayText(d: Descriptor): void {
	const findings: string[] = []
	findings.push(...i18nFindings(d.i18n?.name, `${d.id} i18n.name`))
	findings.push(...i18nFindings(d.i18n?.description, `${d.id} i18n.description`))
	for (const [slotName, slot] of Object.entries(d.slots ?? {})) {
		if (!slot) continue
		const at = `${d.id} slots.${slotName}`
		findings.push(...i18nFindings(slot.description, `${at}.description`))
		for (const [field, decl] of Object.entries(slot.fields ?? {}))
			findings.push(...i18nFindings(decl?.i18n, `${at}.fields.${field}.i18n`))
		findings.push(...settingsSchemaFindings(slot.schema, `${at}.schema`))
	}
	for (const p of d.scriptPoints ?? []) {
		const at = `${d.id} scriptPoints[${String(p.key)}]`
		findings.push(...i18nFindings(p.label, `${at}.label`))
		findings.push(...i18nFindings(p.description, `${at}.description`))
	}
	if (d.sessionShape) {
		findings.push(...settingsSchemaFindings(d.sessionShape.fields, `${d.id} sessionShape.fields`))
		findings.push(...widgetDeclsFindings(d.sessionShape.panels, `${d.id} sessionShape.panels`))
	}
	if (d.entryShape)
		findings.push(...settingsSchemaFindings(d.entryShape.fields, `${d.id} entryShape.fields`))
	if (findings.length)
		throw new Error(
			`${d.id} declares display text a publish refuses (R-20):\n · ${findings.join('\n · ')}`,
		)
}

/**
 * The display text of a list of widget declarations (R-20): each `title`
 * (required — the chrome and the tray show it) and each `settings` schema.
 * Shared by a session shape's `panels` and a genre's shape, which carry the
 * same declarations.
 * @experimental
 */
export function widgetDeclsFindings(raw: unknown, where: string): string[] {
	if (raw === undefined) return []
	if (!Array.isArray(raw)) return [`${where}: the widgets are an array of declarations`]
	const out: string[] = []
	raw.forEach((w, i) => {
		const decl = w as Partial<WidgetDecl> | null
		const at = `${where}[${typeof decl?.id === 'string' ? decl.id : i}]`
		if (!decl || typeof decl !== 'object') {
			out.push(`${at}: a widget declaration is an object — { id, title, component }`)
			return
		}
		out.push(...i18nFindings(decl.title, `${at}.title`, { required: true }))
		out.push(...settingsSchemaFindings(decl.settings, `${at}.settings`))
		// The base sections it reads (R75): a name outside them is refused here.
		out.push(...widgetReadsFindings(decl.reads, `${at}.reads`))
		// What renders inside: `component` (R25) or the deprecated `surface`
		// alias (R24) — exactly one, and a written `remote` is refused.
		const hasComponent = decl.component !== undefined
		const surface = decl.surface as { kind?: unknown } | undefined
		if (hasComponent && surface !== undefined)
			out.push(`${at}: give \`component\` or the deprecated \`surface\`, not both`)
		else if (!hasComponent && surface === undefined)
			out.push(`${at}: names nothing to render — give \`component\`, a component's slug`)
		else if (hasComponent && (typeof decl.component !== 'string' || !decl.component))
			out.push(`${at}.component: a component's slug`)
		else if (surface !== undefined && surface?.kind !== 'frame')
			out.push(
				surface?.kind === 'remote'
					? `${at}.surface: a remote is not written — give \`component\`, the component's slug (R25)`
					: surface?.kind === 'native'
						? `${at}.surface: 'native' is retired (R79) — give \`component\`, the component's slug`
						: `${at}.surface.kind: 'frame' (deprecated — give \`component\`)`,
			)
	})
	return out
}

/** @experimental */
export function getDefinition(id: string): Descriptor | undefined {
	return types.get(id)
}
/** @experimental */
export function allDefinitions(): Descriptor[] {
	return [...types.values()]
}
/** @experimental */
export function _clearDefinitions(): void {
	types.clear()
	registrationFindings.clear()
}

// ── describe*Definition — one per kind, same shape, no modality anywhere ─────
//
// `describeInletDefinition · describeQueryDefinition · describeTaskDefinition ·
// describeOracleDefinition · describeOutletDefinition`. `describeEntryType`
// keeps *type*: the entry-type word is not yet ruled (NOMENCLATURE §5).

/**
 * ## Why every `describe*` is generic over its slots
 *
 * `Descriptor.slots` is the open `Record<string, SlotDecl>`, so a declaration
 * passed straight into it arrives with its **keys erased** — and with them the
 * `params` slot's `schema` keys, which is the entire declared parameter
 * vocabulary of the node. That erasure is what let `input.params.foo` be an
 * `any` lookup on a node whose schema has no `foo`: `topK` and `limit` were
 * both read that way for releases, off nodes that did declare them, at a
 * spelling nothing supplied.
 *
 * Capturing the argument in `S` keeps the literal keys, which is what
 * `InputOf` (src/nodeInput.ts) derives a handler's `input` type from.
 *
 * ⚠ **Type-level only.** `register()` still receives the same object and the
 * content hash is computed over the same runtime value, so nothing here moves a
 * declaration or re-hashes a type.
 *
 * ⚠ **`S` is constrained rather than `const`, and the difference is
 * deliberate.** `describeOracleDefinition` below needs the literal *values* — the
 * `optional: ['json_schema']` tuple `ctx.can()` narrows against — so it pays
 * for `const` with a validation done by intersection in the parameter. Names
 * are all `InputOf` needs, and an object literal keeps its own keys with or
 * without `const`; a `const` here would additionally freeze `accepts: [...]`
 * and `extras: [...]` into readonly tuples, which `SlotDecl` declares as
 * mutable `string[]` and which several core input and task types use.
 * @experimental
 */
export const describeInletDefinition = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, SlotDecl> = Record<string, SlotDecl>,
>(
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & { slots?: S },
) =>
	register({ ...d, kind: 'inlet' as const } as Descriptor<O, I, Id>) as Descriptor<O, I, Id> & {
		kind: 'inlet'
		slots?: S
	}
/** @experimental */
export const describeQueryDefinition = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, SlotDecl> = Record<string, SlotDecl>,
>(
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & { slots?: S },
) =>
	register({ ...d, kind: 'query' as const } as Descriptor<O, I, Id>) as Descriptor<O, I, Id> & {
		kind: 'query'
		slots?: S
	}
/** @public */
export const describeTaskDefinition = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, SlotDecl> = Record<string, SlotDecl>,
>(
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & { slots?: S },
) =>
	register({ ...d, kind: 'task' as const } as Descriptor<O, I, Id>) as Descriptor<O, I, Id> & {
		kind: 'task'
		slots?: S
	}
/**
 * An oracle definition.
 *
 * `const S` on the slots is what makes `ctx.can()` safe: without it,
 * `optional: ['json_schema']` widens to `CapabilityId[]` at the declaration and
 * the binding can only be told "some capability", which is no narrowing at all.
 * With it the literal tuple survives into `Pinned<D>` and out the other side, so
 * a binding asking about a capability its node never declared does not compile.
 * @experimental
 */
export const describeOracleDefinition = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, unknown> = Record<string, never>,
>(
	// The slot validation lives in the PARAMETER, not in `S`'s constraint. A
	// constraint of `Record<string, SlotDecl>` widens each slot to SlotDecl's own
	// declared types, so `optional: ['json_schema']` arrives as
	// `readonly CapabilityId[]` and `ctx.can()` narrows to nothing. Intersecting
	// here validates just as strictly while leaving `S` the literal it was written
	// as — which is the whole basis of the typed probe.
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & {
		slots?: S & Record<string, SlotDecl>
	},
) =>
	register({ ...d, kind: 'oracle' as const } as Descriptor<O, I, Id>) as Descriptor<
		O,
		I,
		Id
	> & { kind: 'oracle'; slots?: S }
/** @experimental */
export const describeOutletDefinition = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, SlotDecl> = Record<string, SlotDecl>,
>(
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & { slots?: S },
) =>
	register({ ...d, kind: 'outlet' as const } as Descriptor<O, I, Id>) as Descriptor<
		O,
		I,
		Id
	> & { kind: 'outlet'; slots?: S }

// ── Entry types (Part 1) ────────────────────────────────────────────────────
//
// A lorebook row's *kind* is a declared, versioned type rather than the table
// it happens to sit in. Three near-identical tables collapse into one, and what
// used to be a schema fact — "world lore has a category, history has a year" —
// becomes a declaration the engine reads.
//
// What keeps that from turning into a swamp is the **field role**: the ranker asks
// the type which field is priority instead of reading `.priority`, so a fourth
// shape is a declaration and not a branch. Three constraints hold the line, and
// each is enforced here rather than reviewed by hand:
//
//  1. **No mini-DSLs.** `order` is an array of `{field, dir}`, never
//     `'date:year,month,day'`. A string the engine parses is code the type
//     ships with extra steps.
//  2. **A new behaviour may add a field role; a new type may not.** The vocabulary is
//     the frozen list below, and a conformance canary (`checkEntryTypes`)
//     watches both directions of it.
//  3. **Types never ship code.** Anything branchy is a *named, versioned,
//     core-owned policy* the type selects from a closed registry — mirroring
//     the deliberate absence of T3 validator code in values.ts.

/**
 * The field roles the engine reads. Frozen, and the reason it is frozen is rule 2
 * above: the list grows when a *behaviour* needs a new question answered, never
 * because a type has a field it would like consulted.
 * @experimental
 */
export const ENTRY_ROLES = [
	/** Which field is this row's display title. */
	'title',
	/** How siblings sort among themselves — structured keys, never a string. */
	'order',
	/** Which field carries the manual 1..3 boost. Absent means **no bonus**. */
	'priority',
	/** Which reference column decides who may see this row, under which policy. */
	'anchor',
	/** Which fields make the text an embedding is computed over. */
	'embedText',
	/** Which field holds the trigger keys the keyword scan matches. */
	'key',
	/** Which reference column points at the row this one hangs under. */
	'parent',
] as const

/** @experimental */
export type EntryRole = (typeof ENTRY_ROLES)[number]

/**
 * The budget bands a candidate can compete in — the engine's `RetrievalBand`,
 * closed on purpose.
 *
 * ⚠ Closed because the failure of an open one is **silent**: the signal-weight
 * and share maps are total over this union, so an entry type declaring a band
 * nobody budgets has its candidates scored against `undefined` and dropped with
 * a green test suite. That is not hypothetical — history was absent from every
 * prompt for two spec versions exactly this way. A new shape picks the band it
 * competes in; it does not mint one.
 * @experimental
 */
export const ENTRY_SOURCE_KINDS = [
	'messages',
	'worldLore',
	'characterLore',
	'history',
	'relationships',
] as const

/** @experimental */
export type EntrySourceKind = (typeof ENTRY_SOURCE_KINDS)[number]

/**
 * The short name this type's rows carry on the wire — `extensions.serenepub`
 * in a character-card book.
 *
 * Closed to the three names already written into exported files. A type outside
 * them simply declares nothing here: no marker is honest, where a marker no
 * importer reads is a file that round-trips into the wrong shape. Widening the
 * list is a deliberate act with an importer change beside it.
 * @experimental
 */
export const ENTRY_EXPORT_KEYS = ['world', 'character', 'history'] as const

/** @experimental */
export type EntryExportKey = (typeof ENTRY_EXPORT_KEYS)[number]

/**
 * Visibility policies a type may select for its anchor.
 *
 * `core:policy/binding-visibility@1` is the four branches character lore
 * already has — character equality, persona membership, narrator-only when the
 * binding is unbound, invisible when the row is unanchored. That is *policy*,
 * so it is named, versioned and implemented by core; the type picks from this
 * list and never authors one (rule 3).
 * @experimental
 */
export const ENTRY_ANCHOR_POLICIES = ['core:policy/binding-visibility@1'] as const

/** @experimental */
export type EntryAnchorPolicy = (typeof ENTRY_ANCHOR_POLICIES)[number]

/**
 * Where a type's rows land when they are not rendered as a variable of their
 * own — a closed vocabulary of destinations, not a free string.
 *
 * `character-card` is today's character lore: qualifying entries are folded
 * into their bound character's own object under an "extra lore" key rather than
 * reaching a template as a list. One member, because one destination exists;
 * the point of the closed list is that the second one is a decision somebody
 * makes here rather than a string somebody types in a catalog.
 * @experimental
 */
export const ENTRY_RENDER_DESTINATIONS = ['character-card'] as const

/** @experimental */
export type EntryRenderDestination = (typeof ENTRY_RENDER_DESTINATIONS)[number]

/**
 * How this type reaches a prompt: the id of the variable whose layout renders
 * it (`core:var/world-lore@1`), or a destination it is folded into.
 * @experimental
 */
export type EntryRender = string | { into: EntryRenderDestination }

/** One key of a sort, in an ordered list. Structured data — never a parsed string. @experimental */
export interface EntryOrderKey {
	/** A declared field, or a column the engine reads for every type. */
	field: string
	dir: 'asc' | 'desc'
	/**
	 * Where absent values sort. Optional because the two-key case (a year and
	 * a month that may be null) is the one that needs it, and most do not.
	 */
	nulls?: 'first' | 'last'
}

/** The reference column that decides who may see a row, and under which policy. @experimental */
export interface EntryAnchor {
	/**
	 * The column carrying the reference. A **real column with a real foreign
	 * key**, never a value inside `fields`: dangling and cross-tenant refs are
	 * a live threat here, which is why cross-ref validation exists at all.
	 */
	column: string
	policy: EntryAnchorPolicy
}

/**
 * Which field plays each field role for this type.
 *
 * Every field role is optional: a type answers the questions it has answers to,
 * and `checkEntryTypes` is what notices when a field role has stopped being
 * answered by anybody — so a dead field role is deleted rather than accreting.
 * @experimental
 */
export interface EntryRoles {
	title?: string
	order?: readonly EntryOrderKey[]
	priority?: string
	anchor?: EntryAnchor
	embedText?: readonly string[]
	key?: string
	parent?: string
}

/**
 * The entry-row contract, as it sits on the descriptor and in the row.
 *
 * **Hashed, all of it.** Field roles, render, source kind, export key and the anchor
 * policy are what the engine reads to decide where a row competes, how it
 * sorts, who may see it and where it renders — so changing one changes what an
 * untouched install does while every pin keeps resolving, which is precisely
 * the silent behaviour change the freeze rule exists to stop. The consequence
 * is intended: **moving a field role forces `@N+1`.**
 *
 * `fields` is hashed too, and it has to be for a second reason: the declared
 * schema is projected into database CHECK constraints, so a schema change is a
 * constraint change. Display text inside it (`i18n`, `description`) is stripped
 * before hashing like everywhere else.
 * @experimental
 */
export interface EntryShape {
	roles: EntryRoles
	/**
	 * The type-specific half of the row — what lands in `fields` jsonb, declared
	 * in the one field language (settings.ts), rendered by the one form
	 * renderer, and projected into constraints and indexes by one boot step.
	 *
	 * Only the **T1 declarative** subset projects into a constraint: required,
	 * type, min/max, enum. T2 predicates (`showIf`) are UI-level and depend on
	 * state a row does not carry.
	 */
	fields?: SettingsSchema
	render?: EntryRender
	sourceKind: EntrySourceKind
	exportKey?: EntryExportKey
	/**
	 * What an amendment to one of these rows means: `amend` layers onto the
	 * base, `replace` supersedes it.
	 *
	 * A **mode, not a per-amendment choice** — mixing both semantics in one
	 * assembled view makes the result unpredictable. Declared on the type with
	 * a per-row override, which is the nullable-with-fallback pattern
	 * `matchMode` already uses.
	 */
	amendMode?: 'amend' | 'replace'
}

/** What an author writes. Flat, because nesting the facets buys nothing here. @experimental */
export interface EntryTypeDecl<Id extends string = string> extends EntryShape {
	/** `core:entry/<name>@N`. The version is the pin, exactly as for node definitions. */
	id: Id
	i18n?: { name?: I18n; description?: I18n }
}

/** An entry type as it comes back out of the registry — the kind, narrowed. @experimental */
export type EntryDescriptor<Id extends string = string> = Descriptor<PortDecl, PortDecl, Id> & {
	kind: 'entry'
	entryShape: EntryShape
}

const ENTRY_TYPE_ID = /^([a-z0-9][a-z0-9.-]*):entry\/([a-z0-9][a-z0-9-]*)@(\d+)$/

/**
 * Declare an entry type.
 *
 * The version lives in the id and therefore at every call site that names one,
 * which is the same convention `pin()` keeps for node definitions. What is
 * deliberately *not* here is a pinned constructor: `pin()` mints `v1()`, and
 * `v1()` builds a node a spec wires. An entry type is a row shape — there is
 * nothing to construct — so minting one would offer a call that can only ever
 * be a mistake.
 * @experimental
 */
export const describeEntryType = <const Id extends string>(
	d: EntryTypeDecl<Id>,
): EntryDescriptor<Id> => {
	const { id, i18n, ...shape } = d
	// Before the id is claimed, so a refused declaration can be fixed and
	// retried — the same order `checkModeTitled` runs in.
	assertEntryShape(id, shape)
	return register({
		id,
		i18n,
		kind: 'entry' as const,
		// An entry type publishes nothing: it is not in the graph. Empty rather
		// than optional so `Descriptor` keeps meaning one thing for the five
		// kinds that are.
		ports: {},
		entryShape: shape,
	}) as EntryDescriptor<Id>
}

/** Every entry type this build declares. @internal */
export const allEntryTypes = (): EntryDescriptor[] =>
	allDefinitions().filter((t): t is EntryDescriptor => t.kind === 'entry')

/**
 * Refusals at the author's line — an id, a namespace, and four closed
 * vocabularies.
 *
 * Throwing rather than collecting findings, because every one of these is a
 * typo or a decision somebody has to make, and none of them has a partial
 * answer worth keeping.
 */
function assertEntryShape(id: string, shape: EntryShape): void {
	if (!ENTRY_TYPE_ID.test(id))
		throw new Error(
			`'${id}' is not a valid entry type id. The grammar is ` +
				`'<namespace>:entry/<name>@<major>' — 'core:entry/world-lore@1'. The version ` +
				`is the pin, exactly as for node definitions.`,
		)
	/**
	 * Core is the sole author of entry types, and this line is the switch.
	 *
	 * Not a permanent property of the design — an entry type is data, and
	 * nothing about the projection cares who wrote it. What is missing is the
	 * rest of the story: a plugin-authored type needs its constraint projection
	 * gated, its `fields` reviewed and its rows owned. Until that exists the
	 * honest state is off, said out loud, in one place.
	 */
	if (!id.startsWith('core:'))
		throw new Error(
			`'${id}' cannot be declared: entry types are core-authored in this release. ` +
				`The row shape is data and nothing in the projection cares who wrote it, so ` +
				`this is a switch rather than a wall — but a plugin-owned type also owns a ` +
				`database constraint and the rows under it, and that half is not built.`,
		)

	const unknown = unknownRoles(shape)
	if (unknown.length)
		throw new Error(
			`${id} declares ${unknown.map((r) => `'${r}'`).join(', ')}, which no engine ` +
				`behaviour reads. The field roles are ${ENTRY_ROLES.join(', ')} — a new *behaviour* ` +
				`may add one, a new *type* may not, or the vocabulary is just a second name ` +
				`for the field.`,
		)

	if (!ENTRY_SOURCE_KINDS.includes(shape.sourceKind as EntrySourceKind))
		throw new Error(
			`${id} declares sourceKind '${shape.sourceKind}', which is not a budget band. ` +
				`Pick one of ${ENTRY_SOURCE_KINDS.join(', ')} — the weight and share maps are ` +
				`total over those five, so a sixth name is not a new band, it is candidates ` +
				`scored against undefined and dropped with nothing reporting it.`,
		)

	if (shape.exportKey && !ENTRY_EXPORT_KEYS.includes(shape.exportKey))
		throw new Error(
			`${id} declares exportKey '${shape.exportKey}', which no importer reads. The ` +
				`wire names are ${ENTRY_EXPORT_KEYS.join(', ')}; declare nothing to export ` +
				`without a marker.`,
		)

	const policy = shape.roles?.anchor?.policy
	if (policy && !ENTRY_ANCHOR_POLICIES.includes(policy))
		throw new Error(
			`${id} anchors under policy '${policy}', which core does not implement. Pick ` +
				`one of ${ENTRY_ANCHOR_POLICIES.join(', ')}. Types select policies; they ` +
				`never author them, which is what keeps a declaration from being code.`,
		)

	const render = shape.render
	if (typeof render === 'object' && !ENTRY_RENDER_DESTINATIONS.includes(render.into))
		throw new Error(
			`${id} renders into '${render.into}', which is not a destination. The ` +
				`destinations are ${ENTRY_RENDER_DESTINATIONS.join(', ')}; a variable id ` +
				`('core:var/world-lore@1') is the other legal value.`,
		)
	if (typeof render === 'string' && !/^[a-z0-9][a-z0-9.-]*:var\/[a-z0-9-]+@\d+$/.test(render))
		throw new Error(
			`${id} renders as '${render}', which is not a variable id. Name the variable ` +
				`whose layout renders these rows — 'core:var/world-lore@1' — or fold them ` +
				`into a destination with { into: … }.`,
		)
}

const unknownRoles = (shape: { roles?: EntryRoles }): string[] =>
	Object.keys(shape.roles ?? {}).filter((r) => !(ENTRY_ROLES as readonly string[]).includes(r))

/** A conformance finding. Every one names what to do, as everywhere here (15 §1.3). @experimental */
export interface EntryFinding {
	severity: 'error'
	code: 'E_UNKNOWN_ROLE' | 'E_DEAD_ROLE'
	message: string
	fix: string
	where?: string
}

/**
 * The conformance canary — the field role vocabulary checked in **both** directions
 * (the shape values.ts's four-way registry canary already has).
 *
 * Forward: nothing declares a field role the engine does not read.
 * `describeEntryType`
 * refuses that at the author's line, so this is the backstop for declarations
 * that did not come through the door — a row written by another build, a type
 * read back from the registry.
 *
 * Backward, and this is the direction that earns the canary: **every field role
 * the engine reads is declared by somebody.** A field role no type answers is a
 * question
 * the engine asks nothing, and the vocabulary is frozen precisely so that one
 * gets deleted rather than sitting there looking supported.
 * @experimental
 */
export function checkEntryTypes(
	types: ReadonlyArray<{ id: string; entryShape?: EntryShape }>,
): EntryFinding[] {
	const findings: EntryFinding[] = []
	const declared = new Set<string>()

	for (const t of types) {
		const shape = t.entryShape
		if (!shape) continue
		for (const role of Object.keys(shape.roles ?? {})) declared.add(role)
		for (const role of unknownRoles(shape))
			findings.push({
				severity: 'error',
				code: 'E_UNKNOWN_ROLE',
				where: t.id,
				message: `declares field role '${role}', which no engine behaviour reads`,
				fix:
					`use one of ${ENTRY_ROLES.join(', ')}, or add the field role here and the ` +
					`behaviour that reads it in the same change. A field role only a declaration ` +
					`knows about is a field with a longer name.`,
			})
	}

	for (const role of ENTRY_ROLES)
		if (!declared.has(role))
			findings.push({
				severity: 'error',
				code: 'E_DEAD_ROLE',
				where: role,
				message: `no entry type declares '${role}', so nothing answers it`,
				fix:
					`declare it on the type it describes, or delete the field role. The vocabulary ` +
					`is frozen so that it stays small — an unanswered field role is one the engine ` +
					`asks and nobody hears.`,
			})

	return findings
}

/**
 * A pinned constructor. The builder method names the *kind*; this names the
 * *type and version* (04 §4b). Both are required — drop either and F21 or static
 * pin-checking goes with it.
 * @experimental
 */
export interface NodeSpec<D extends Descriptor<any, any, any> = Descriptor> {
	readonly __node: true
	descriptor: D
	config: Record<string, unknown>
}

/** `'core:query/session-history@2'` → `'2'`. Absent means `1`. */
type VersionOf<S extends string> = S extends `${string}@${infer V}` ? V : '1'

/** @experimental */
export type NodeCtor<D extends Descriptor<any, any, any>> = (
	config?: Record<string, unknown>,
) => NodeSpec<D>

/**
 * A pinned constructor (04 §4b).
 *
 * The builder method names the **kind**; this names the **type and version**, and the
 * version sits at the call site — `generateText.v1({ … })` — for three reasons that a
 * version baked into the id cannot deliver:
 *
 *  - upgrading a pin is a **visible diff**, not an invisible change of meaning
 *  - two versions of a type can **coexist in one spec**, which a migration needs
 *  - a deprecated pin **strikes through** on `generateText.v1` precisely, because the
 *    key is what carries the version
 * @experimental
 */
export type Pinned<D extends Descriptor<any, any, any>> = {
	readonly [K in `v${VersionOf<D['id']>}`]: NodeCtor<D>
} & {
	readonly id: D['id']
	readonly descriptor: D
}

/** @public */
export function pin<D extends Descriptor<any, any, any>>(descriptor: D): Pinned<D> {
	const version = /@(\d+)$/.exec(descriptor.id)?.[1] ?? '1'
	const ctor: NodeCtor<D> = (config: Record<string, unknown> = {}) => ({
		__node: true,
		descriptor,
		config,
	})
	return { [`v${version}`]: ctor, id: descriptor.id, descriptor } as Pinned<D>
}

/** The out-port map of whatever a pinned constructor produces — the scope's raw material. @experimental */
export type OutPortsOf<N> =
	N extends NodeSpec<infer D>
		? D extends Descriptor<infer O, any, any>
			? O
			: PortDecl
		: PortDecl

/**
 * The in-ports that make a `liveRow` outlet's write the run's live row (F7,
 * W1): a placeholder (`generating`) or a claimed row (`row`). Anything else
 * the outlet writes is a complete row — an ordinary write, as many as the
 * pipeline likes.
 * @experimental
 */
export const LIVE_ROW_PORTS = ['generating', 'row'] as const

/** Whether a `liveRow` outlet's resolved payload opens the live row (see `LIVE_ROW_PORTS`). @experimental */
export function opensLiveRow(payload: unknown): boolean {
	if (!payload || typeof payload !== 'object') return false
	const p = payload as Record<string, unknown>
	return Boolean(p.generating) || (p.row !== undefined && p.row !== null)
}
