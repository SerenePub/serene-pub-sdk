/**
 * 🚧 **Exposure** — who sees a setting, and what its value is, read as one
 * cascade (A10, R1, R32; PLAN-layering D4).
 *
 * One rule at every layer — the declaration (a genre's field or a
 * pipeline's setting), the genre's defaults, the preset, the session:
 * **each layer may set a value, and may lock it or leave it open for the
 * layer below.**
 *
 *  · The declaration states how far the setting may ever reach
 *    (`FieldDecl.reach`: `admin` | `owner`). Model plumbing is never `owner`.
 *  · The owner sees a setting when its reach is `owner` and no layer above
 *    locked it. A locked setting shows its value, read-only, to admins, and
 *    nothing to the owner.
 *  · The start form is a placement, not a level: a preset (or the genre's
 *    defaults) marks an owner-open setting `askAtStart`, and it appears on
 *    the start screen under the preset.
 *  · A setting `fixedAtStart` is resolved once, at creation, and is
 *    read-only for everyone afterwards (R32).
 *
 * Values follow the same chain (core < the genre's defaults < the preset <
 * the session), so "who may change it" and "what it is" are read the same
 * way, top to bottom. Pure: the host's settings form and the SDK's preset
 * check call the same function.
 * @experimental
 * @ruling A10, R1, R32
 */

import type { FieldDecl } from './settings.js'

/**
 * A setting's value as one layer states it: the value itself, or the value
 * with what the layer decides about the layers below — `lock` (no layer
 * below may change it) and `askAtStart` (place it on the start form).
 * Absent from a layer means the layer leaves it as it found it.
 * @experimental
 * @ruling A10
 */
export type SettingValue =
	unknown | { readonly value: unknown; readonly lock?: true; readonly askAtStart?: true }

/** A setting value with its layer decisions read out. @experimental */
export interface ReadSettingValue {
	value: unknown
	lock: boolean
	askAtStart: boolean
}

const WRAPPER_KEYS = new Set(['value', 'lock', 'askAtStart'])

/**
 * Is this the `{ value, lock?, askAtStart? }` form? An object with a `value`
 * and nothing but those three keys, at least one decision among them — a
 * plain `{ value: 3 }` reads as itself either way.
 * @experimental
 */
export function isSettingDecision(
	v: unknown,
): v is { value: unknown; lock?: true; askAtStart?: true } {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return false
	const keys = Object.keys(v)
	return (
		keys.includes('value') &&
		keys.every((k) => WRAPPER_KEYS.has(k)) &&
		((v as { lock?: unknown }).lock === true ||
			(v as { askAtStart?: unknown }).askAtStart === true)
	)
}

/** A layer's setting value read out: the value, and whether it locks or asks at start. @experimental */
export function settingValueOf(v: SettingValue): ReadSettingValue {
	if (isSettingDecision(v))
		return { value: v.value, lock: v.lock === true, askAtStart: v.askAtStart === true }
	if (
		v &&
		typeof v === 'object' &&
		!Array.isArray(v) &&
		Object.keys(v).length === 1 &&
		'value' in v
	)
		return { value: (v as { value: unknown }).value, lock: false, askAtStart: false }
	return { value: v, lock: false, askAtStart: false }
}

/**
 * Write a setting value with a decision about the layers below:
 * `setting('scripts', { lock: true })`, `setting('gentle', { askAtStart: true })`.
 * @experimental
 */
export function setting(
	value: unknown,
	decide: { lock?: boolean; askAtStart?: boolean } = {},
): SettingValue {
	return {
		value,
		...(decide.lock ? { lock: true as const } : {}),
		...(decide.askAtStart ? { askAtStart: true as const } : {}),
	}
}

/**
 * Model plumbing — what a member never sees (ruled 10-12): the connection a
 * step runs on, its sampling, its loadout, its prompts and its templates.
 * A setting by one of these names, or one sourcing its options from a
 * connection, can never reach the owner.
 * @experimental
 * @ruling R1, 10-12
 */
export const MODEL_PLUMBING: readonly string[] = Object.freeze([
	'connection',
	'sampling',
	'speechSampling',
	'loadout',
	'prompts',
	'prompt',
	'template',
	'templates',
	'variables',
	'wire',
	'workflow',
])

/** Is this setting model plumbing — by its key, or by sourcing its options from a connection? @experimental */
export const isModelPlumbing = (key: string, decl?: Pick<FieldDecl, 'from'>): boolean =>
	MODEL_PLUMBING.includes(key) ||
	(typeof decl?.from === 'string' && decl.from.startsWith('connection.'))

/**
 * Every exposure fault in a schema: model plumbing declared `reach: 'owner'`
 * (never — ruled 10-12), an unknown reach, a `fixedAtStart` that is not
 * `true`. As sentences that say what to do instead.
 * @experimental
 * @ruling R1, R32
 */
export function exposureFindings(
	schema: Readonly<Record<string, FieldDecl>> | undefined,
	at = 'fields',
): string[] {
	const out: string[] = []
	for (const [key, d] of Object.entries(schema ?? {})) {
		if (!d || typeof d !== 'object') continue
		if (d.reach !== undefined && d.reach !== 'admin' && d.reach !== 'owner')
			out.push(`${at}.${key}.reach: 'admin' or 'owner' — not ${JSON.stringify(d.reach)}`)
		if (d.reach === 'owner' && isModelPlumbing(key, d))
			out.push(
				`${at}.${key} is model plumbing (the connection, sampling, loadout, prompts or templates a step ` +
					`runs on) and declares reach: 'owner' — plumbing is an administrator's, never a member's; drop the reach`,
			)
		if (d.fixedAtStart !== undefined && d.fixedAtStart !== true)
			out.push(`${at}.${key}.fixedAtStart: true or absent`)
		if (d.type === 'object' && d.fields) out.push(...exposureFindings(d.fields, `${at}.${key}`))
	}
	return out
}

/** One layer of the cascade, top (the genre's defaults) to bottom (the session). @experimental */
export interface ExposureLayer {
	/** `genre` · `preset` · `session`, or a host's own name for a layer. */
	layer: 'genre' | 'preset' | 'session' | (string & {})
	values: Readonly<Record<string, SettingValue>>
}

/** One setting as the cascade resolved it. @experimental */
export interface ResolvedExposure {
	value: unknown
	/** The layer that locked it, when one did: no layer below it could change the value. */
	lockedAt?: string
	/** Whether the session's owner sees it: reach `owner`, not locked, not plumbing, not fixed after creation. */
	ownerSees: boolean
	/** Whether the start form asks it — an owner-open setting a layer placed there. */
	askAtStart: boolean
	/** The layer the value came from (`declaration` for the field's default). */
	from: string
	/** 🚧 Fixed at start (R32) and past creation: read-only for everyone. */
	fixed?: true
}

/**
 * The exposure cascade for one schema (A10, R32). `fields` are the
 * declarations (each with `default`, `reach`, `fixedAtStart`); `layers` go
 * top to bottom — the genre's defaults, the preset, the session. Each layer
 * may set a value, lock it, or place it on the start form; a lock stops every
 * layer below from changing it.
 *
 * `stage: 'start'` resolves for the start form (a `fixedAtStart` setting is
 * still open there); `'session'` (the default) for a running session, where
 * one is read-only for everyone. `defaultReach` is the reach of a field that
 * states none — `'owner'` for a genre's fields, `'admin'` (the default) for a
 * pipeline's settings.
 * @experimental
 * @ruling A10, R32
 */
export function resolveExposure(
	fields: Readonly<Record<string, FieldDecl>>,
	layers: readonly ExposureLayer[],
	opts: { stage?: 'start' | 'session'; defaultReach?: 'admin' | 'owner' } = {},
): Record<string, ResolvedExposure> {
	const out: Record<string, ResolvedExposure> = {}
	const stage = opts.stage ?? 'session'
	for (const [key, decl] of Object.entries(fields)) {
		let value: unknown = decl.default
		let from = 'declaration'
		let lockedAt: string | undefined
		let ask = false
		for (const layer of layers) {
			if (lockedAt) break
			if (!Object.prototype.hasOwnProperty.call(layer.values, key)) continue
			const read = settingValueOf(layer.values[key])
			value = read.value
			from = layer.layer
			if (read.askAtStart) ask = true
			if (read.lock) lockedAt = layer.layer
		}
		const reach = decl.reach ?? opts.defaultReach ?? 'admin'
		const fixed = decl.fixedAtStart === true && stage === 'session'
		const ownerSees = reach === 'owner' && !lockedAt && !isModelPlumbing(key, decl) && !fixed
		out[key] = {
			value,
			...(lockedAt ? { lockedAt } : {}),
			ownerSees,
			// A fixed-at-start setting open to the owner is always asked (R32);
			// any other owner-open one only where a layer placed it.
			askAtStart: ownerSees && (ask || decl.fixedAtStart === true),
			from,
			...(fixed ? { fixed: true as const } : {}),
		}
	}
	return out
}
