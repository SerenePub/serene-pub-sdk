/**
 * 🚧 **The genre-owned summarize-scene** (live scenes §13–§14, 2026-10-13):
 * one builder, the explicit graph behind it.
 *
 * ## Why a builder
 *
 * The genre owns the pipeline its scenes are summarized with
 * (`genre(…, { summarize: { scene } })`), so every genre ships one — and five
 * hand-written copies of the same nine nodes is five places for one fix to
 * miss. `summarizeScene(id, options)` compiles to the explicit graph
 * `summarizeSpec` builds, with the scene's own source and transcript in
 * front of it:
 *
 *     input (summarize-request@1)
 *       → source  (summarize-source@2: story rows + aside rows, by range)
 *       → attachments (history-attachments@1: the story rows' files)
 *       → asideAttachments (history-attachments@1: the aside rows' files)
 *       → roster  (session-cast@1)
 *       → render  (render-transcript@1: the genre's transcript template)
 *       → batches (batch-messages@2: units → text batches)
 *       → drafting map (summarize-batch@1, one draft per batch, `{{batch}}` as text)
 *       → synth → naming [→ cast extraction, on ice] → save
 *
 * A helper that expands to an explicit spec is the house rule (no magic in
 * core): a modder who wants more than the options ejects to the document it
 * emits, as with `keeperAction`.
 *
 * ## What each option is
 *
 * - `channels.story` / `channels.asides` — written onto the Default preset
 *   as the source step's params, so an admin sees and edits them in the
 *   Pipelines view like any other param. Asides are channels the summary
 *   reads as context, never as events: the Lair's `sanctum`.
 * - `transcript` — the render step's template source (Handlebars, three
 *   inline partials `preamble` / `line` / `aside`), on the Default preset.
 *   Absent, the shipped Default (`DEFAULT_TRANSCRIPT_TEMPLATE`) — Chat's.
 * - `genre` — the genre the spec is built for. Not a lock (a summarize
 *   request is not a session event, so nothing dispatches on it): the
 *   builder checks the story and aside channels against the genre's
 *   declared channels, so a typo is a build failure rather than an aside
 *   that never matches a row.
 * - `boundaries` — 🚧 the genre's own **boundary triggers** (★9, ruled
 *   2026-10-13): where, beside core's (the day changed, time passed, the
 *   place changed…), a new scene begins while a session is played — *the
 *   party reached a new floor*. Deterministic predicates only (the line's
 *   channel, a narration, who spoke, the action that wrote it, a state key
 *   that changed), each refused here when it does not read and a `channel`
 *   the genre does not declare refused by name. Written onto the document
 *   as `contributes.boundaryTriggers` — content, hashed with it — and absent
 *   when none are declared, so a spec that declares none hashes as it did.
 *   The host's boundary watcher reads them off the session's
 *   summarize-scene spec; session settings list each as a switch, on by
 *   default.
 *
 * ## The fixed ends
 *
 * The inlet is `core:inlet/summarize-request@1` and the outlet the same
 * `save` every summarize spec ends in; the scenes socket previews to `save`
 * and reads `synth`, `naming` and `cast` by node key. Those keys are the
 * contract with the host and the builder never renames them.
 * @experimental
 */

import {
	boundaryTriggerFindings,
	channelDecls,
	compile,
	handlebars,
	slot,
	spec,
	DEFAULT_CHANNEL,
	type BoundaryTriggerDecl,
	type GenreDecl,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_LOADOUT } from '../../loadouts.js'

/** See `summarizeSpec.ts` — the same ceiling, for the same reason. */
const MAX_BATCHES = 512

/** The drafting Provider's node key, qualified — see `summarizeSpec.ts`. */
const DRAFT_NODE = 'drafting.item.draft'

/**
 * 🚧 The shipped **Default transcript template** — Chat's, and the builder's
 * when a genre names none.
 *
 * Three inline partials, each rendered on its own by
 * `core:task/render-transcript@1`: `preamble` once per batch head, `line`
 * per story message, `aside` per side-channel row (after the story line it is
 * attached to). Anything outside the partials is never rendered. Triple
 * braces throughout: this is text for a model, not HTML. A line's files
 * follow its text (`{{{attachments}}}`, which carries its own line break),
 * named as `summarizeSpec`'s batches name them: `[image: cat.png — a grey cat]`;
 * an aside's files follow its text the same way (lane E).
 * @experimental
 */
export const DEFAULT_TRANSCRIPT_TEMPLATE = [
	'{{#*inline "preamble"}}',
	'{{#if scene.name}}Scene: {{{scene.name}}}{{#if scene.place}}, at {{{scene.place}}}{{/if}}{{#if scene.date}} ({{{scene.date}}}){{/if}}\n{{/if}}',
	'{{#if cast.length}}Present: {{#each cast}}{{{name}}}{{#unless @last}}, {{/unless}}{{/each}}\n{{/if}}',
	'{{/inline}}',
	'{{#*inline "line"}}{{{name}}}: {{{text}}}{{{attachments}}}{{/inline}}',
	'{{#*inline "aside"}}[Aside on {{{channel}}}, outside the story] {{{name}}}: {{{text}}}{{{attachments}}}{{/inline}}',
].join('\n')

/** @experimental */
export interface SummarizeSceneOptions {
	/** Semver of the spec. A published version is immutable: a change is a new version. */
	version: string
	/** The genre the spec is built for — checked against, never locked to (see the module note). */
	genre: GenreDecl
	/**
	 * Which channel is the story and which are asides. `story` is `main`
	 * for every core genre; `asides` defaults to none.
	 */
	channels: { story: string; asides?: readonly string[] }
	/** The transcript template's Handlebars source. Absent: `DEFAULT_TRANSCRIPT_TEMPLATE`. */
	transcript?: string
	/**
	 * Wire the cast-extraction oracle after naming. **Off** for every core
	 * genre: the extraction is on ice by ruling (2026-09-08, see
	 * `scene.ts`) — participants come from the roster and the span's
	 * senders. Kept as an option so reviving it is one property.
	 */
	extractsCast?: boolean
	/**
	 * 🚧 The genre's own boundary triggers (★9) — see the module note.
	 * Absent or empty: core's triggers alone.
	 */
	boundaries?: readonly BoundaryTriggerDecl[]
}

/** The channel a lane-qualified slug belongs to: `sanctum:2` → `sanctum`. */
const baseChannel = (slug: string) => slug.split(':')[0]!

/**
 * Build a genre's summarize-scene spec.
 * @experimental
 */
export function summarizeScene(id: string, options: SummarizeSceneOptions) {
	const { version, genre, channels, transcript, extractsCast, boundaries } = options
	const story = channels?.story
	const asides = [...(channels?.asides ?? [])]
	if (typeof story !== 'string' || !story.trim())
		throw new Error(`${id}: channels.story names the story's channel — '${DEFAULT_CHANNEL}' for a chat log`)
	const declared = new Set(channelDecls(genre?.shape).map((c) => c.slug))
	for (const slug of [story, ...asides])
		if (!declared.has(baseChannel(slug)))
			throw new Error(
				`${id}: '${slug}' is not a channel ${genre?.id ?? 'the genre'} declares (${[...declared].join(', ')}) — ` +
					`a summary would read no rows from it`,
			)
	if (asides.some((a) => baseChannel(a) === baseChannel(story)))
		throw new Error(`${id}: '${story}' is the story's channel and cannot also be an aside`)
	if (new Set(asides).size !== asides.length) throw new Error(`${id}: channels.asides names a channel twice`)
	const triggerFaults = boundaryTriggerFindings(boundaries === undefined ? undefined : [...boundaries], 'boundaries', {
		channels: [...declared],
	})
	if (triggerFaults.length) throw new Error(`${id}: ${triggerFaults.join('\n')}`)

	const base = spec(id, {
		version,
		/** Catalogue claims: `maintenance`, as every summarize spec (ruled 2026-10-05). */
		taxonomy: { role: 'maintenance' },
		// 🚧 ★9: present only when declared, so a spec that declares none hashes as it did.
		...(boundaries?.length
			? { contributes: { boundaryTriggers: boundaries.map((b) => ({ ...b, when: { ...b.when } })) } }
			: {}),
	})
		.inlet('input', C.summarizeRequest.v1())
		.query('source', ($) =>
			C.summarizeSource.v2({
				scope: $.input.scope,
				request: $.input.request,
				params: slot.params(),
			}),
		)
		// The files those story rows show — the read `summarizeSpec` makes
		// (attachments follow-ups, owner ruling 2026-10-03), so a message
		// that is only a picture is summarized as that picture's name, not
		// as nothing. The render names each line's files after its text.
		.query('attachments', ($) =>
			C.historyAttachments.v1({
				messages: $.source.messages,
				params: slot.params(),
			}),
		)
		// 🚧 The aside rows' files (lane E): an aside that is only a picture
		// is named as that picture too, after its text. Its own heading, so
		// the settings never show two steps headed "History attachments".
		.query(
			'asideAttachments',
			($) =>
				C.historyAttachments.v1({
					messages: $.source.asides,
					params: slot.params(),
				}),
			{ expose: { label: 'Transcript aside attachments' } },
		)
		.query('roster', ($) => C.sessionCast.v1({ scope: $.input.scope }))
		.task('render', ($) =>
			C.renderTranscript.v1({
				messages: $.source.messages,
				asides: $.source.asides,
				attachments: $.attachments.attachments,
				asideAttachments: $.asideAttachments.attachments,
				cast: $.roster.cast,
				// The request carries the scene (`request.scene`) when the
				// host knows it; the binding reads that field.
				scene: $.input.request,
				template: slot.template(),
			}),
		)
		.task('batches', ($) =>
			C.batchMessages.v2({
				preamble: $.render.preamble,
				units: $.render.units,
				params: slot.params(),
				// The drafting step's own sampling, by reference — see `summarizeSpec.ts`.
				sampling: slot.samplingOf(DRAFT_NODE),
			}),
		)
		.each('drafting', { over: ($: any) => $.batches.batches, max: MAX_BATCHES }, (m) =>
			m.oracle(
				'draft',
				($: any) =>
					C.summarizeBatch.v1({
						// One batch, as TEXT: the transcript template already
						// laid it out, and the drafting prompt places it with
						// `{{batch}}`.
						batch: $.drafting.item,
						request: $.input.request,
						loreType: 'scene',
						connection: slot.connection(),
						sampling: slot.sampling(),
						prompts: slot.prompts(),
					}),
				{
					expose: {
						label: 'Drafting',
						purpose: 'Summarises the transcript a batch at a time, one draft per batch.',
					},
				},
			),
		)
		.oracle(
			'synth',
			($: any) =>
				C.summarizeSynth.v1({
					drafts: $.drafting.main,
					request: $.input.request,
					loreType: 'scene',
					connection: slot.connection(),
					sampling: slot.sampling(),
					prompts: slot.prompts(),
				}),
			{
				expose: {
					label: 'Combining',
					purpose: 'Merges the drafts into one summary, the text of the scene.',
				},
			},
		)
		.oracle(
			'naming',
			($: any) =>
				C.nameEntry.v1({
					content: $.synth.content,
					loreType: 'scene',
					connection: slot.connection(),
					sampling: slot.sampling(),
					prompts: slot.prompts(),
				}),
			{
				expose: {
					label: 'Naming',
					purpose: 'Gives the summary its title, the name the scene is filed under.',
				},
			},
		)

	const withCast = extractsCast
		? base.oracle('cast', ($: any) =>
				C.extractCast.v1({
					content: $.synth.content,
					request: $.input.request,
					connection: slot.connection(),
					sampling: slot.sampling(),
					prompts: slot.prompts(),
				}),
			)
		: base

	return compile(
		withCast
			.outlet('save', ($: any) =>
				C.createLoreEntry.v1({
					name: $.naming.name,
					content: $.synth.content,
					params: slot.params(),
				}),
			)
			.preset('default', { label: 'Default', default: true }, (p: any) => {
				const named = p
					.params('source', { channel: story, asides })
					.template('render', { engine: handlebars.id, source: transcript ?? DEFAULT_TRANSCRIPT_TEMPLATE })
					.loadout(DRAFT_NODE, slot.loadout(CORE_LOADOUT.extraction))
					.loadout('synth', slot.loadout(CORE_LOADOUT.extraction))
					.loadout('naming', slot.loadout(CORE_LOADOUT.extraction))
				return extractsCast ? named.loadout('cast', slot.loadout(CORE_LOADOUT.extraction)) : named
			})
			.build(),
	)
}
