/**
 * Sampling parameters, declared per shape.
 *
 * A sampling config used to be thirty typed columns and thirty `<key>Enabled`
 * booleans on one table — a layout that could only ever describe *text*
 * generation, because the columns named text samplers. Adding image generation
 * would have meant either a second table with a second seeding path and a second
 * picker, or image columns sitting empty on every text row. Both make the modality
 * a branch in every consumer.
 *
 * So a row is now `{ shape, values, enabled }`: an id saying which vocabulary it
 * speaks, an object of values, and the list of keys that are actually in play.
 * The vocabulary itself lives here, in the SDK, next to the shapes it is keyed by
 * — the same place a provider declares `shape: S.imageGen`, so a sampling config
 * and the provider that consumes it cannot drift into disagreeing about what a
 * parameter is called.
 *
 * ## Resolution
 *
 * `resolveSamplingValues` is the one path from a stored row to what an adapter
 * receives:
 *
 *   values → keep the keys named in `enabled` → keep the keys the shape declares
 *          → fill enabled-but-unset from the schema default → hand over
 *
 * Two kinds of key deliberately survive in the row without ever being sent: keys
 * that are switched off, and keys the shape does not declare. Neither is an error
 * and neither is discarded — turning a sampler off and back on must not lose the
 * value you had, and a row written by a newer build (or carrying a UI-only flag
 * like `contextTokensUnlocked`) must round-trip through an older one intact. The
 * filter is on the way *out*, not on the way in.
 *
 * ## What is not here
 *
 * Backend-specific knobs. Fooocus' `performance_selection`, a ComfyUI workflow, an
 * A1111 `override_settings` — those belong to the *connection*, declared by its
 * adapter's `profileSchema`. A sampling config is the modality's shared vocabulary;
 * if a key here meant something to only one backend, every other backend's picker
 * would be showing a control that does nothing. Adapters translate what they can
 * and report the rest as ignored.
 */

import type { FieldDecl, SettingsSchema } from './settings.js'
import type { ShapeId } from './shapes.js'
import { S } from './shapes.js'

// ── The vocabularies ────────────────────────────────────────────────────────

/**
 * Text generation — the union of what the shipped adapters can map.
 *
 * Every key here appears in at least one adapter's key map. A row may enable a
 * key the *chosen* connection cannot honour (enabling DRY and then pointing the
 * config at Anthropic); that is reported by the adapter as ignored, not blocked
 * here, because the config outlives the connection it happens to be paired with.
 */
export const textSamplingSchema: SettingsSchema = {
	// ── Core ────────────────────────────────────────────────────────────
	temperature: {
		type: 'number',
		label: 'Temperature',
		description: 'Controls randomness (0 = deterministic, higher = more random).',
		min: 0,
		max: 2,
		default: 0.7,
		quick: true,
		group: 'Core',
	},
	topP: {
		type: 'number',
		label: 'Top P',
		description: 'Nucleus sampling — keep tokens whose cumulative probability exceeds this.',
		min: 0,
		max: 1,
		default: 0.92,
		quick: true,
		group: 'Core',
	},
	topK: {
		type: 'integer',
		label: 'Top K',
		description: 'Limit selection to the K most likely tokens.',
		min: 0,
		max: 200,
		default: 80,
		quick: true,
		group: 'Core',
	},
	minP: {
		type: 'number',
		label: 'Min P',
		description: 'Minimum probability threshold for token selection.',
		min: 0,
		max: 1,
		default: 0.05,
		group: 'Core',
	},
	typicalP: {
		type: 'number',
		label: 'Typical P',
		description: 'Typical sampling (1.0 = disabled).',
		min: 0,
		max: 1,
		default: 1,
		group: 'Core',
	},
	seed: {
		type: 'integer',
		label: 'Seed',
		description: 'Reproducible generation. -1 draws a fresh one each time.',
		min: -1,
		default: -1,
		group: 'Core',
	},

	// ── Repetition ──────────────────────────────────────────────────────
	repetitionPenalty: {
		type: 'number',
		label: 'Repetition Penalty',
		description: 'Penalty applied to repeated tokens (1.0 = none).',
		min: 0.1,
		max: 2,
		default: 1.15,
		quick: true,
		group: 'Repetition',
	},
	repeatLastN: {
		type: 'integer',
		label: 'Repeat Last N',
		description: 'How far back the repetition penalty looks.',
		min: 0,
		max: 2048,
		default: 64,
		group: 'Repetition',
	},
	frequencyPenalty: {
		type: 'number',
		label: 'Frequency Penalty',
		description: 'Penalty scaled by how often a token has already appeared.',
		min: -2,
		max: 2,
		default: 0.2,
		quick: true,
		group: 'Repetition',
	},
	presencePenalty: {
		type: 'number',
		label: 'Presence Penalty',
		description: 'Penalty for a token appearing at all — encourages new topics.',
		min: -2,
		max: 2,
		default: 0.6,
		quick: true,
		group: 'Repetition',
	},
	penalizeNewline: {
		type: 'boolean',
		label: 'Penalize Newline',
		description: 'Apply the repetition penalty to newline tokens too.',
		default: false,
		group: 'Repetition',
	},

	// ── Mirostat ────────────────────────────────────────────────────────
	mirostat: {
		type: 'integer',
		label: 'Mirostat',
		description: 'Mirostat sampling: 0 disabled, 1 or 2 selects the version.',
		min: 0,
		max: 2,
		default: 0,
		group: 'Mirostat',
	},
	mirostatTau: {
		type: 'number',
		label: 'Mirostat Tau',
		description: 'Target perplexity for Mirostat.',
		min: 0,
		max: 10,
		default: 5,
		group: 'Mirostat',
	},
	mirostatEta: {
		type: 'number',
		label: 'Mirostat Eta',
		description: 'Learning rate for Mirostat.',
		min: 0,
		max: 1,
		default: 0.1,
		group: 'Mirostat',
	},

	// ── XTC ─────────────────────────────────────────────────────────────
	xtcProbability: {
		type: 'number',
		label: 'XTC Probability',
		description: 'Chance of applying Exclude Top Choices on a given token.',
		min: 0,
		max: 1,
		default: 0,
		group: 'XTC',
	},
	xtcThreshold: {
		type: 'number',
		label: 'XTC Threshold',
		description: 'Probability floor a token must clear to be an XTC candidate.',
		min: 0,
		max: 0.5,
		default: 0.1,
		group: 'XTC',
	},

	// ── DRY ─────────────────────────────────────────────────────────────
	dryMultiplier: {
		type: 'number',
		label: 'DRY Multiplier',
		description: "Penalty multiplier for Don't Repeat Yourself sampling (0 = off).",
		min: 0,
		max: 5,
		default: 0,
		group: 'DRY',
	},
	dryBase: {
		type: 'number',
		label: 'DRY Base',
		description: 'Exponential base for the DRY penalty.',
		min: 1,
		max: 10,
		default: 1.75,
		group: 'DRY',
	},
	dryAllowedLength: {
		type: 'integer',
		label: 'DRY Allowed Length',
		description: 'Repetition this long or shorter goes unpenalised.',
		min: 1,
		max: 20,
		default: 2,
		group: 'DRY',
	},
	dryPenaltyLastN: {
		type: 'integer',
		label: 'DRY Penalty Last N',
		description: 'How far back DRY looks. -1 is the whole context.',
		min: -1,
		max: 2048,
		default: -1,
		group: 'DRY',
	},
	drySequenceBreakers: {
		type: 'string[]',
		label: 'DRY Sequence Breakers',
		description: 'Tokens that reset DRY’s idea of a repetition.',
		default: ['\\n', ':', '"', '*'],
		group: 'DRY',
	},

	// ── Dynamic temperature ─────────────────────────────────────────────
	dynatempRange: {
		type: 'number',
		label: 'Dynamic Temperature Range',
		description: 'Spread around the base temperature (0 = static).',
		min: 0,
		max: 5,
		default: 0,
		group: 'Dynamic temperature',
	},
	dynatempExponent: {
		type: 'number',
		label: 'Dynamic Temperature Exponent',
		description: 'How sharply temperature moves within its range.',
		min: 0.1,
		max: 5,
		default: 1,
		group: 'Dynamic temperature',
	},
	tfsZ: {
		type: 'number',
		label: 'Tail Free Sampling',
		description: 'Trims the low-probability tail (1.0 = disabled).',
		min: 0,
		max: 1,
		default: 1,
		group: 'Dynamic temperature',
	},

	// ── KoboldCPP-only ──────────────────────────────────────────────────
	// These four are in koboldCppSamplingKeyMap and always have been, but had no
	// column — so no row could ever set them and the mapping was unreachable.
	// A declared vocabulary costs nothing to extend: off by default, translated
	// by the one adapter that knows them, reported ignored by the rest.
	topA: {
		type: 'number',
		label: 'Top A',
		description: 'Top-A sampling (KoboldCPP).',
		min: 0,
		max: 1,
		default: 0,
		group: 'KoboldCPP',
	},
	nsigma: {
		type: 'number',
		label: 'N-Sigma',
		description: 'Top N-Sigma. Above 0 enables it (KoboldCPP).',
		min: 0,
		max: 10,
		default: 0,
		group: 'KoboldCPP',
	},
	smoothingFactor: {
		type: 'number',
		label: 'Smoothing Factor',
		description: 'Changes how temperature behaves. Above 0 uses smoothing (KoboldCPP).',
		min: 0,
		max: 10,
		default: 0,
		group: 'KoboldCPP',
	},
	bannedTokens: {
		type: 'string[]',
		label: 'Banned Tokens',
		description: 'Words or phrases that may never be generated (KoboldCPP).',
		default: [],
		group: 'KoboldCPP',
	},

	// ── Reasoning ───────────────────────────────────────────────────────
	// How hard the model thinks is a SAMPLING parameter, chosen per stage
	// through the sampling slot (ruling 2026-09-12) — never a flag on the
	// connection. A connection is shared, so a flag there is one answer for
	// every stage that shares it, and a planner nobody reads cannot then differ
	// from the prose the reader is waiting for.
	//
	// The four members below are the whole enum: there is no `default`/`auto`
	// beside them, because a field that is switched OFF already sends nothing
	// at all, which is how a config says "leave it to the service". A fifth
	// member meaning that would be a second spelling of a state the switchboard
	// has.
	reasoning: {
		type: 'enum',
		label: 'Reasoning',
		description:
			'How much the model reasons before answering. Off sends none of it; the response token limit still counts reasoning on most services.',
		of: ['off', 'low', 'medium', 'high'],
		default: 'off',
		group: 'Reasoning',
	},
	reasoningBudget: {
		type: 'integer',
		label: 'Reasoning Budget',
		description:
			'Reasoning tokens allowed, for services that take a number. Used with reasoning set to low, medium or high.',
		min: 0,
		// The HARD bound, in the sense the two budgets below use the word: the
		// largest value that is valid at all, which is what
		// `normalizeSamplingRow` clamps to. It sits just past the widest level
		// the adapters' own table names (high = 32000), so a number chosen by
		// hand can always exceed a level and never exceed a response.
		max: 32768,
		default: 8000,
		group: 'Reasoning',
	},

	// ── Budgets and stops ───────────────────────────────────────────────
	// `max` on these two is the HARD bound — the largest value that is valid at
	// all, which is what `normalizeSamplingRow` clamps to. It is deliberately far
	// above the range a form should offer by default: the sidebar shows a 4096 /
	// 32768 slider and an "unlock max" toggle that opens it up to these. A schema
	// max set to the comfortable range instead would clamp the unlocked value
	// straight back down on save, which is the bug that shape invites.
	responseTokens: {
		type: 'integer',
		label: 'Response Tokens',
		description: 'Ceiling on how much is generated in one reply.',
		min: 1,
		max: 65536,
		default: 512,
		quick: true,
		group: 'Budget',
	},
	contextTokens: {
		type: 'integer',
		label: 'Context Tokens',
		description: 'How much conversation the model is given to read.',
		min: 512,
		max: 524288,
		default: 4096,
		quick: true,
		group: 'Budget',
	},
	stop: {
		type: 'string[]',
		label: 'Stop Sequences',
		description: 'Generation ends when one of these appears.',
		default: [],
		group: 'Budget',
	},
	logitBias: {
		type: 'text',
		format: 'json',
		label: 'Logit Bias',
		description: 'Token id → bias, as JSON.',
		default: {},
		group: 'Budget',
	},
}

/**
 * Image generation — the parameters every image backend either honours or can
 * say it ignored.
 *
 * Everything is optional and nothing is required to have a value: an unset key
 * means "whatever the backend does by default", which is the only honest answer
 * when the same config is pointed at Fooocus, ComfyUI and a hosted API in turn.
 * `sampler` and `scheduler` are free strings rather than enums for the same
 * reason — the valid set is a property of the connection (its checkpoint, its
 * build), not of the vocabulary, so a picker fills them from the adapter's
 * reported capabilities.
 *
 * ⚠ These are the knobs of LOCAL DIFFUSION, and that is a real boundary rather
 * than an accident of which adapters happened to ship first. A hosted image
 * service shares almost none of them: OpenAI's gpt-image-1 takes `size` (an ENUM
 * of exactly `1024x1024`, `1024x1536`, `1536x1024`), `quality`, `background`,
 * `output_format`, `output_compression` and `n` — no steps, no CFG, no sampler,
 * no scheduler, no seed. `batch` maps to `n`, a free width/height has to SNAP to
 * one of the three allowed sizes, and the rest is inexpressible.
 *
 * That does not make this schema wrong; it makes it the shared vocabulary of the
 * backends that HAVE these knobs — and the rest of the answer is already in
 * place, so the fix is never "add hosted keys here". What one backend alone
 * offers belongs to its CONNECTION, declared by the adapter's `profileSchema`
 * (`quality` and `background` are profile fields); what a backend cannot honour
 * is REPORTED through `applied`/`ignored`, not dropped. A hosted-only key added
 * here would put a control that does nothing in front of every local user, which
 * is exactly what the "What is not here" note above forbids — and by the same
 * argument there is no such thing as a hosted sampling *preset*: a hosted
 * service has no sampling knobs to preset, it has a profile.
 */
export const imageSamplingSchema: SettingsSchema = {
	steps: {
		type: 'integer',
		label: 'Steps',
		description: 'Denoising steps. More is slower and usually sharper, to a point.',
		min: 1,
		max: 150,
		default: 25,
		quick: true,
		group: 'Core',
	},
	cfg: {
		type: 'number',
		label: 'CFG Scale',
		description: 'How strictly the image follows the prompt.',
		min: 0,
		max: 30,
		default: 5,
		quick: true,
		group: 'Core',
	},
	width: {
		type: 'integer',
		label: 'Width',
		description: 'Requested width in pixels. Backends with fixed sizes snap to the nearest.',
		min: 64,
		max: 4096,
		default: 1024,
		quick: true,
		group: 'Size',
	},
	height: {
		type: 'integer',
		label: 'Height',
		description: 'Requested height in pixels.',
		min: 64,
		max: 4096,
		default: 1024,
		quick: true,
		group: 'Size',
	},
	batch: {
		type: 'integer',
		label: 'Batch',
		description: 'How many images per run.',
		min: 1,
		max: 8,
		default: 1,
		quick: true,
		group: 'Core',
	},
	seed: {
		type: 'integer',
		label: 'Seed',
		description: 'Reproducible generation. -1 draws a fresh one each time.',
		min: -1,
		default: -1,
		quick: true,
		group: 'Core',
	},
	sampler: {
		type: 'string',
		label: 'Sampler',
		description: 'Sampling algorithm. Which names are valid depends on the backend.',
		group: 'Advanced',
	},
	scheduler: {
		type: 'string',
		label: 'Scheduler',
		description: 'Noise schedule. Which names are valid depends on the backend.',
		group: 'Advanced',
	},
	clipSkip: {
		type: 'integer',
		label: 'CLIP Skip',
		description: 'How many final CLIP layers to skip.',
		min: 1,
		max: 12,
		default: 2,
		group: 'Advanced',
	},
	denoise: {
		type: 'number',
		label: 'Denoise',
		description: 'How much of the source image to overwrite. Only meaningful with an input image.',
		min: 0,
		max: 1,
		default: 1,
		group: 'Advanced',
	},
}

/**
 * Speech synthesis.
 *
 * Present because `core:provider/speak@1` declares `sampling: { shape: S.tts }`,
 * and a sampling slot whose shape has no vocabulary resolves to nothing at all —
 * silently, since an unknown shape is an empty schema by design. A declared slot
 * with no declared vocabulary is the one combination where that fallback is
 * indistinguishable from a bug.
 *
 * `voice` is a free string for the same reason `sampler` is on images: the valid
 * names belong to the connection, not to the vocabulary.
 */
export const ttsSamplingSchema: SettingsSchema = {
	voice: {
		type: 'string',
		label: 'Voice',
		description: 'Which voice to speak in. The available names come from the connection.',
		quick: true,
		group: 'Voice',
	},
	speed: {
		type: 'number',
		label: 'Speed',
		description: 'Playback rate. 1 is the voice’s natural pace.',
		min: 0.25,
		max: 4,
		default: 1,
		quick: true,
		group: 'Voice',
	},
	pitch: {
		type: 'number',
		label: 'Pitch',
		description: 'Shift up or down from the voice’s natural pitch.',
		min: -20,
		max: 20,
		default: 0,
		group: 'Voice',
	},
	volume: {
		type: 'number',
		label: 'Volume',
		description: 'Gain applied to the rendered audio.',
		min: 0,
		max: 2,
		default: 1,
		group: 'Voice',
	},
}

/** Every vocabulary, keyed by the shape whose connections speak it. */
export const SAMPLING_SCHEMAS: Record<ShapeId, SettingsSchema> = {
	[S.textGen]: textSamplingSchema,
	[S.imageGen]: imageSamplingSchema,
	[S.tts]: ttsSamplingSchema,
}

/** The shape a row without one is assumed to speak. */
export const DEFAULT_SAMPLING_SHAPE: ShapeId = S.textGen

/**
 * The vocabulary for a shape.
 *
 * An unknown shape resolves to an empty schema rather than throwing: a row
 * written by a plugin whose provider is not installed should read as "no
 * parameters I can offer", not as a crash in whatever happened to load it.
 */
export function samplingSchemaFor(shape?: ShapeId | null): SettingsSchema {
	return SAMPLING_SCHEMAS[shape ?? DEFAULT_SAMPLING_SHAPE] ?? {}
}

// ── Resolution ──────────────────────────────────────────────────────────────

/** The stored side of a sampling config — the three columns that carry meaning. */
export interface SamplingRowLike {
	shape?: ShapeId | null
	values?: Record<string, unknown> | null
	enabled?: readonly string[] | null
}

/** What an adapter receives: flat, enabled-only, defaults already applied. */
export type ResolvedSampling = Record<string, unknown>

/**
 * Stored row → what the adapter is handed.
 *
 * The whole filter lives here so that no consumer has to remember the order, and
 * so "is this key on?" has exactly one answer in the codebase. Callers get a
 * plain object: spreading a runtime override onto it is expected and is how
 * per-call budgets are applied.
 */
export function resolveSamplingValues(
	row: SamplingRowLike,
	schema: SettingsSchema = samplingSchemaFor(row.shape)
): ResolvedSampling {
	const values = row.values ?? {}
	const enabled = row.enabled ?? []
	const out: ResolvedSampling = {}

	for (const key of enabled) {
		const decl = schema[key]
		// Enabled but not in this shape's vocabulary: kept in the row, not sent.
		// A newer build's key travelling through an older one lands here.
		if (!decl) continue
		const stored = values[key]
		const value = stored === undefined || stored === null ? decl.default : stored
		// A key with neither a stored value nor a default has nothing to say.
		if (value === undefined) continue
		out[key] = value
	}

	return out
}

/**
 * Bring a row into a consistent state, without discarding anything.
 *
 * Called on the write path, so that what the form submits and what a seed
 * declares end up identical in the table. It coerces the types the schema
 * declares (a number field arriving as `"0.7"` from a form input is the common
 * case) and drops duplicate/ill-typed entries from `enabled`.
 *
 * It deliberately does NOT drop unknown keys from `values`: `enabled` is the
 * switchboard, `values` is the memory. Off-schema keys — a UI-only flag such as
 * `contextTokensUnlocked`, or a parameter belonging to a shape this build does
 * not know — stay exactly where they were, and `resolveSamplingValues` is what
 * keeps them off the wire.
 */
export function normalizeSamplingRow(
	row: SamplingRowLike,
	schema: SettingsSchema = samplingSchemaFor(row.shape)
): { shape: ShapeId; values: Record<string, unknown>; enabled: string[] } {
	const shape = row.shape ?? DEFAULT_SAMPLING_SHAPE
	const values: Record<string, unknown> = { ...(row.values ?? {}) }

	for (const [key, decl] of Object.entries(schema)) {
		if (!(key in values)) continue
		const coerced = coerce(values[key], decl)
		if (coerced === undefined) delete values[key]
		else values[key] = coerced
	}

	const enabled = [...new Set(row.enabled ?? [])].filter(
		(k): k is string => typeof k === 'string' && k in schema
	)

	return { shape, values, enabled }
}

/**
 * A stored value in the type its declaration promises.
 *
 * `undefined` means "this cannot be that type" and the caller removes the key —
 * better an unset parameter falling back to its default than `NaN` reaching a
 * backend as a temperature.
 */
function coerce(value: unknown, decl: FieldDecl): unknown {
	if (value === null || value === undefined) return undefined

	switch (decl.type) {
		case 'number':
		case 'integer': {
			const n = typeof value === 'number' ? value : Number(value)
			if (!Number.isFinite(n)) return undefined
			const r = decl.type === 'integer' ? Math.round(n) : n
			return clamp(r, decl.min, decl.max)
		}
		case 'boolean':
			if (typeof value === 'boolean') return value
			if (value === 'true') return true
			if (value === 'false') return false
			return undefined
		case 'string[]':
			if (Array.isArray(value)) return value.map(String)
			// A textarea that collected one line per entry.
			if (typeof value === 'string')
				return value
					.split('\n')
					.map((s) => s.trim())
					.filter(Boolean)
			return undefined
		case 'string':
		case 'enum':
			return typeof value === 'string' ? value : String(value)
		case 'text':
			// `format: 'json'` fields hold parsed data; the renderer stringifies
			// for display and parses on submit, so either side may arrive here.
			if (decl.format === 'json' && typeof value === 'string') {
				try {
					return JSON.parse(value)
				} catch {
					return undefined
				}
			}
			return value
		default:
			return value
	}
}

const clamp = (n: number, min?: number, max?: number): number => {
	if (min !== undefined && n < min) return min
	if (max !== undefined && n > max) return max
	return n
}
