/**
 * One representative declaration per shipped value kind, minted through the
 * real toolkit rather than hand-written JSON.
 *
 * That matters: a sandbox whose declarations were literals would happily show
 * a control for a shape `v.weights({…})` refuses to produce, and the first
 * person to trust it would author something the packager rejects. Going
 * through the toolkit means every sample in the sandbox is a declaration an
 * author could actually write.
 */
import { makeValueToolkit, valueKind, type ValueDecl } from '@serene-pub/sdk'

const v = makeValueToolkit()

export interface Sample {
	kind: string
	decl: ValueDecl
	/** A value that satisfies the declaration, for the first render. */
	value: unknown
	/** What the author writes to get it. */
	source: string
}

const sample = (decl: ValueDecl, value: unknown, source: string): Sample => ({
	kind: valueKind(decl),
	decl,
	value,
	source,
})

export const SAMPLES: Sample[] = [
	sample(
		v.integer({ min: 1, max: 32, default: 8 }),
		8,
		'v.integer({ min: 1, max: 32, default: 8 })',
	),
	sample(
		v.number({ min: 0, max: 2, step: 0.05, default: 0.7 }),
		0.7,
		'v.number({ min: 0, max: 2, step: 0.05, default: 0.7 })',
	),
	sample(v.fraction({ default: 0.25 }), 0.25, 'v.fraction({ default: 0.25 })'),
	sample(v.boolean({ default: true }), true, 'v.boolean({ default: true })'),
	sample(
		v.text({ maxLength: 80, default: 'A tavern at dusk' }),
		'A tavern at dusk',
		'v.text({ maxLength: 80 })',
	),
	sample(
		v.text({ multiline: true, default: 'Line one\nLine two' }),
		'Line one\nLine two',
		'v.text({ multiline: true })',
	),
	sample(
		v.select([
			{ value: 'rag', label: 'Retrieval', description: 'Pull from the lorebook' },
			{ value: 'none', label: 'None', description: 'Send the log as-is' },
		]),
		'rag',
		"v.select([{ value: 'rag', label: 'Retrieval', … }, …])",
	),
	sample(
		v.ranking(['recency', 'relevance', 'importance']),
		['relevance', 'recency', 'importance'],
		"v.ranking(['recency', 'relevance', 'importance'])",
	),
	sample(
		v.stackedBar({ parts: { lore: 40, history: 45, persona: 15 }, total: 100, step: 1 }),
		{ lore: 40, history: 45, persona: 15 },
		'v.stackedBar({ parts: { … }, total: 100, step: 1 })',
	),
	sample(
		v.weights({ parts: { alpha: 1, beta: 2 }, min: 0 }),
		{ alpha: 1, beta: 2 },
		'v.weights({ parts: { alpha: 1, beta: 2 }, min: 0 })',
	),
	sample(v.prompt(), null, 'v.prompt()'),
]

/**
 * A kind the registry does not know, so the safe degradation is visible
 * rather than described. It is minted by hand precisely because the toolkit
 * would refuse it — that is the situation being demonstrated.
 */
export const UNKNOWN_SAMPLE: Sample = {
	kind: 'acme.dice:roll@1',
	decl: { 'acme.dice:roll@1': { sides: 20 } },
	value: { sides: 20 },
	source: "v.custom('roll', 1, { sides: 20 })  — from a package this build has never seen",
}
