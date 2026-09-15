/**
 * What the harness pushes down the channel.
 *
 * The point of fixtures is that a surface can only ever render *what the host
 * chose to post* (20 §12) — so the honest way to develop one is against the
 * host's actual posting shape, not against a live instance where it is easy to
 * accidentally depend on something core never sends. These mirror what the
 * session page hands `PluginFrame` today: a thin session (`{id, name}`), the
 * session's message rows, and per-panel props.
 *
 * Replace them wholesale with `serene-pub ui --fixtures my.json`, or edit them
 * live in the harness — the editor pushes on every valid parse.
 */

export interface Fixtures {
	session: Record<string, unknown>
	messages: Array<Record<string, unknown>>
	props: Record<string, unknown>
	/** What a component receives as `ctx` (10 §5). */
	ctx: Record<string, unknown>
}

/**
 * Coerce parsed JSON into the shape the stage feeds a surface.
 *
 * The editor accepts anything that *parses*, and parsing is a much weaker
 * promise than "has the fields the pushers read". Deleting `messages`, or
 * making it an object, threw inside the push and took the whole stage down —
 * a JSON editor whose worst case is a blank page is a JSON editor nobody
 * edits. Missing or wrong-typed pieces fall back to the defaults, and the
 * caller is told which ones, so the substitution is visible rather than
 * mysterious.
 */
export function normalizeFixtures(
	raw: unknown,
	base: Fixtures,
): { fixtures: Fixtures; substituted: string[] } {
	const substituted: string[] = []
	const src = (raw ?? {}) as Record<string, unknown>
	const obj = (v: unknown, key: keyof Fixtures, fallback: Record<string, unknown>) => {
		if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
		if (v !== undefined) substituted.push(key)
		return fallback
	}
	let messages = base.messages
	if (Array.isArray(src.messages)) messages = src.messages as Array<Record<string, unknown>>
	else if (src.messages !== undefined) substituted.push('messages')

	return {
		fixtures: {
			session: obj(src.session, 'session', base.session),
			messages,
			props: obj(src.props, 'props', base.props),
			ctx: obj(src.ctx, 'ctx', base.ctx),
		},
		substituted,
	}
}

const message = (
	id: number,
	channel: string,
	role: string,
	speakerLabel: string,
	text: string,
	extras: Record<string, unknown> = {},
) => ({
	id,
	sessionId: 1,
	channel,
	kind: 'core:chat',
	version: '1.0',
	role,
	speakerLabel,
	status: 'settled',
	activeRevisions: { '0': 0 },
	extras,
	content: text,
	createdAt: '2026-08-28T12:00:00.000Z',
})

export const DEFAULT_FIXTURES: Fixtures = {
	session: { id: 1, name: 'The Sunken Vault' },
	messages: [
		message(1, 'main', 'user', 'Wren', 'We push the door open. What do we see?'),
		message(
			2,
			'main',
			'assistant',
			'Narrator',
			'Cold air, and a stairwell going down further than the lantern reaches.',
		),
		message(3, 'map', 'assistant', 'Cartographer', 'Vault — level 1', {
			'acme.map': { x: 4, y: 7, revealed: ['stair', 'antechamber'] },
		}),
		message(4, 'tasks', 'assistant', 'Quartermaster', 'Find the vault key', {
			'acme.tasks': { done: false, priority: 'high' },
		}),
	],
	props: { title: 'Vault', zoom: 2 },
	ctx: {
		user: { id: 1, role: 'admin', display: 'Wren' },
		theme: 'catppuccin',
		locale: 'en',
		settings: {},
		state: {},
	},
}
