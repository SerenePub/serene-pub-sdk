/**
 * Core's **look** declarations — part of the announcement, the same as the
 * widgets and layouts beside them.
 *
 * A look is a declared layout variable at root, zone or unit scope. Seven of
 * them is the whole of core's layout vocabulary, and that is deliberate: the
 * model grows by somebody *declaring* a look rather than by this file learning
 * a key. A plugin ships its own under a namespaced key (`<pluginId>.key`) and
 * `resolve` reads both the same way.
 *
 * Four are **structural** — `resolve` reads their values to build the grid
 * templates. The other three are pass-through CSS variables for the host's
 * stylesheet: the host never interprets a backdrop, it just sets the variable
 * at the right scope and lets CSS do the rest. (`chrome` — card or bare — was
 * retired 2026-09-27 with the hidden v2 stage, its only reader.)
 *
 * ⚠ `backdrop` names an image by **media row id, never a URL**. The one is a
 * reference the media table owns and can revoke; the other is an unbounded
 * fetch from a person's layout document.
 */
import type { LookDecl } from '@serene-pub/sdk'

/** @experimental */
export const CORE_LOOKS: LookDecl[] = [
	{
		key: 'cell',
		/**
		 * The cell module — the one physical unit the whole document is in.
		 * Emitted in `rem` (the value over 16), so "four cells tall" follows
		 * the reader's zoom instead of pinning itself to one device's pixels.
		 */
		field: {
			type: 'integer',
			label: 'Cell size',
			description: 'The module every fixed track is counted in.',
			min: 40,
			max: 64,
			default: 44,
		},
		appliesTo: ['root'],
		structural: true,
		cssVar: '--sp-cell',
		unit: 'rem',
	},
	{
		key: 'gap',
		field: {
			type: 'integer',
			label: 'Gap',
			description: 'The space between tracks.',
			min: 0,
			max: 32,
			default: 12,
		},
		appliesTo: ['root', 'zone'],
		structural: true,
		cssVar: '--sp-gap',
		unit: 'px',
	},
	{
		key: 'pad',
		field: {
			type: 'integer',
			label: 'Padding',
			description:
				'The space inside a zone, around its tracks. Defaults to none — zone padding is a per-layout choice.',
			min: 0,
			max: 48,
			default: 0,
		},
		appliesTo: ['root', 'zone'],
		structural: true,
		cssVar: '--sp-pad',
		unit: 'px',
	},
	{
		key: 'railWidth',
		field: {
			type: 'integer',
			label: 'Rail width',
			description: 'How wide an unpinned side is when it is a strip of icons.',
			min: 36,
			max: 64,
			default: 36,
		},
		appliesTo: ['root'],
		structural: true,
		cssVar: '--sp-rail-width',
		unit: 'px',
	},
	{
		key: 'headerRow',
		field: {
			type: 'boolean',
			label: 'Session name row',
			description: 'The row above the zones carrying the session name.',
			default: true,
		},
		appliesTo: ['root'],
	},
	{
		key: 'backdrop',
		/**
		 * A fixed-key record, so a form can be drawn from it and a stored value
		 * checked against it. `kind` decides which of the other two is read —
		 * which is what keeps "no image chosen" and "an image that was deleted"
		 * two different states rather than one empty string.
		 */
		field: {
			type: 'object',
			label: 'Backdrop',
			description: 'What sits behind: nothing, a picture from your media, or a colour.',
			fields: {
				kind: {
					type: 'enum',
					label: 'Kind',
					of: ['none', 'media', 'color'],
					members: [
						{ key: 'none', label: 'Nothing' },
						{ key: 'media', label: 'Picture' },
						{ key: 'color', label: 'Colour' },
					],
					default: 'none',
				},
				media: {
					type: 'media',
					label: 'Picture',
					accepts: ['image'],
					showIf: { field: 'kind', equals: 'media' },
				},
				color: {
					type: 'string',
					label: 'Colour',
					showIf: { field: 'kind', equals: 'color' },
				},
			},
		},
		appliesTo: ['root', 'zone', 'unit'],
	},
	{
		key: 'glass',
		field: {
			type: 'boolean',
			label: 'Glass',
			description: 'A translucent, blurred surface — worth it over a backdrop, not otherwise.',
			default: false,
		},
		appliesTo: ['root', 'zone', 'unit'],
	},
]

/** One look by key, for a caller holding a key that wants the declaration. @experimental */
export const coreLook = (key: string): LookDecl | undefined => CORE_LOOKS.find((l) => l.key === key)
