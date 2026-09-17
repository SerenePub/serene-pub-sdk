/**
 * Message blocks (20 §6) — custom message content as **data, not code**.
 *
 * A plugin's message part carries a block tree in `data.blocks`; core renders
 * it with its own components. Nothing to sanitize (no HTML crosses the
 * boundary), theming and accessibility are core's once for everyone, and
 * interactivity is *declared*: a `choices` button or a `form` submit names a
 * function key, and pressing it fires the trigger machinery with the message
 * as subject — the same audited path every contributed button already takes.
 *
 * The validator is the write-time gate: a hostile or malformed tree is refused
 * with the block path named, and the caps make "render whatever a sandboxed
 * hook produced" a bounded promise. Findings carry a `fix` like every finding
 * in this SDK (15 §1.3).
 */

import type { FieldDecl, SettingsSchema } from './settings.js'
import { checkSchema } from './settings.js'
import { ACTION_IDENTITY, ACTION_IDENTITY_MAX_LENGTH, actionsOf, effectsOf } from './actions.js'
import { isParticipantRef, type ParticipantRef } from './participants.js'

/**
 * What a `choices` button or a `form` submit fires (U5c review, W-E).
 *
 * `fn` is the function key — what routing resolves. `action` is the
 * **identity** of the declaration the press is held to, `<spec slug>#<key>`
 * (`ACTION_IDENTITY`): the server checks THAT action's audience and
 * enablement and runs THAT spec, so a block a spec wrote for any
 * participant (`act: ['participant']`) admits a guest. It is **written by
 * the outlet that created the block** from the run's spec
 * (`stampBlockActions`), never by the client, which only carries it back on
 * the fire. A block carrying none — one stored before this field, or one
 * whose spec declares no action for `fn` — is fired as the legacy shape and
 * gets the narrowest reading: the owner floor.
 */
export interface BlockActionRef {
	fn: string
	action?: string
}

/**
 * A **form** (plans/29 R-15 *Forms*; 30 §U5d, built 2026-09-17) is an
 * action still awaiting its answer, addressed to an audience and carried in
 * a message: a `choices` block (one question, several options) or a `form`
 * block (fields to fill). The two fields below are what make a block a form
 * rather than a row of buttons:
 *
 *  - **`addressee`** — who the question is put to, as a participant
 *    reference (`character:12`, `envoy:mascot`, `owner`, `user:3`). The
 *    addressee IS the block's audience: the person portraying them may
 *    answer (the click), and when the host's resolver says the AI portrays
 *    them this turn, core records `core:event/form-addressed@1` and the
 *    genre's answer pipeline answers through an oracle with the `json`
 *    capability — receipted, reviewable, never magical. A block with no
 *    addressee is what it always was: buttons anyone the action's audience
 *    admits may press.
 *  - **`id`** — the block's identity within its message, stamped by the
 *    host at the write (`assignBlockIds`) so a fire, a `form-addressed`
 *    event and a `form-answered` change can all name it. Never written by a
 *    spec; one it wrote is kept.
 *
 * A `choices` option carries **`choice`**, the option key its press answers
 * with (`{ choice }` is the fire's payload, and the oracle's schema is an
 * enum of these keys). Options of an addressed block must each carry one,
 * distinct — a question with options must be answerable by key.
 */
export interface FormBlockFields {
	id?: string
	addressee?: ParticipantRef
	/**
	 * The question put to the addressee, as prose — what the block shows
	 * above its options or fields, and what the answer pipeline puts to the
	 * oracle. A `choices` block with no question is a row of buttons and
	 * cannot be addressed: there is nothing to answer.
	 */
	question?: string
}

export type MessageBlock =
	/** Markdown text — the workhorse. */
	| { kind: 'md'; text: string }
	/** Label/value rows — stats panels, item cards. */
	| { kind: 'kv'; rows: Array<{ label: string; value: string }> }
	/** A small table. Rendering may scroll it; it never overflows the log. */
	| { kind: 'table'; columns: string[]; rows: string[][] }
	/** A labelled meter — HP bars, progress, clocks. */
	| { kind: 'stat'; label: string; value: number; max?: number }
	/** An attachment from the session's asset store — never a foreign URL. */
	| { kind: 'image'; assetId: number; alt?: string }
	/**
	 * Action buttons. `fn` is a function key resolved through the mode's
	 * contribution machinery (19 §3–§4); pressing one fires
	 * `sessions:triggerFunction` with the message and the choice as subject.
	 * `action` is the identity of the declaration the button fires
	 * (`BlockActionRef`), stamped by the outlet that wrote the block.
	 */
	| ({
			kind: 'choices'
			actions: Array<BlockActionRef & { label: string; icon?: string; choice?: string }>
	  } & FormBlockFields)
	/**
	 * A form rendered from the one field language (`SettingsSchema`);
	 * submitting fires `fn` with the entered values as the payload.
	 */
	| ({ kind: 'form'; fields: SettingsSchema; label?: string } & BlockActionRef & FormBlockFields)
	/** Nesting, one layout hint. Depth-capped by the validator. */
	| { kind: 'group'; layout?: 'row' | 'column'; blocks: MessageBlock[] }

export interface MessageBlockFinding {
	/** e.g. `blocks[2].actions[0]` */
	path: string
	message: string
	fix: string
}

/** The caps that make rendering a sandbox's output a bounded promise. */
export const MESSAGE_BLOCK_LIMITS = {
	maxBlocks: 64,
	maxDepth: 3,
	maxText: 64 * 1024,
	maxRows: 64,
	maxActions: 12
} as const

/** The longest block id the validator accepts; a host's uuid is 36. */
export const BLOCK_ID_MAX_LENGTH = 64

const finding = (path: string, message: string, fix: string): MessageBlockFinding => ({
	path,
	message,
	fix,
})

/**
 * Validate a candidate block tree. Empty findings = renderable. Total, never
 * throws — the host refuses a write on findings rather than crashing on one.
 */
export function checkMessageBlocks(value: unknown): MessageBlockFinding[] {
	const f: MessageBlockFinding[] = []
	if (!Array.isArray(value))
		return [finding('blocks', 'is not an array', 'send an array of blocks')]
	let count = 0

	const str = (v: unknown, path: string, what: string): v is string => {
		if (typeof v !== 'string') {
			f.push(finding(path, `${what} is not a string`, 'send text'))
			return false
		}
		if (v.length > MESSAGE_BLOCK_LIMITS.maxText)
			f.push(
				finding(
					path,
					`${what} exceeds ${MESSAGE_BLOCK_LIMITS.maxText} bytes`,
					'shorten it — a block is a card, not a document',
				),
			)
		return true
	}

	/** `action` is optional; present, it is an identity and nothing looser. */
	const identity = (v: unknown, path: string): void => {
		if (v === undefined) return
		if (typeof v !== 'string' || v.length > ACTION_IDENTITY_MAX_LENGTH || !ACTION_IDENTITY.test(v))
			f.push(
				finding(
					path,
					'is not an action identity',
					"name the declaration as '<spec slug>#<key>', or omit it — the outlet stamps it",
				),
			)
	}

	/** The two form fields (`FormBlockFields`): an optional id, an optional participant reference. */
	const formFields = (b: Record<string, unknown>, p: string): void => {
		if (b.id !== undefined && (typeof b.id !== 'string' || !b.id || b.id.length > BLOCK_ID_MAX_LENGTH))
			f.push(finding(`${p}.id`, 'is not a block id', 'omit it — the host stamps one at the write'))
		if (b.addressee !== undefined && !isParticipantRef(b.addressee))
			f.push(
				finding(
					`${p}.addressee`,
					'is not a participant reference',
					"address the form to 'character:<id>', 'envoy:<slug>', 'owner' or 'user:<id>', or omit it",
				),
			)
		if (b.question !== undefined) str(b.question, `${p}.question`, 'question')
		else if (b.addressee !== undefined)
			f.push(
				finding(
					`${p}.question`,
					'is missing on an addressed form',
					'say what is being asked — the addressee (or the oracle answering for them) needs the question',
				),
			)
	}

	const walk = (blocks: unknown[], path: string, depth: number): void => {
		if (depth > MESSAGE_BLOCK_LIMITS.maxDepth) {
			f.push(
				finding(path, `nesting exceeds depth ${MESSAGE_BLOCK_LIMITS.maxDepth}`, 'flatten the groups'),
			)
			return
		}
		for (let i = 0; i < blocks.length; i++) {
			const p = `${path}[${i}]`
			if (++count > MESSAGE_BLOCK_LIMITS.maxBlocks) {
				f.push(
					finding(p, `more than ${MESSAGE_BLOCK_LIMITS.maxBlocks} blocks in the tree`, 'split the message'),
				)
				return
			}
			const b = blocks[i] as Record<string, unknown> | null
			if (!b || typeof b !== 'object' || Array.isArray(b)) {
				f.push(finding(p, 'is not a block object', 'send {kind, …}'))
				continue
			}
			switch (b.kind) {
				case 'md':
					str(b.text, `${p}.text`, 'text')
					break
				case 'kv': {
					if (!Array.isArray(b.rows)) {
						f.push(finding(`${p}.rows`, 'is not an array', 'send label/value rows'))
						break
					}
					if (b.rows.length > MESSAGE_BLOCK_LIMITS.maxRows)
						f.push(finding(`${p}.rows`, `more than ${MESSAGE_BLOCK_LIMITS.maxRows} rows`, 'trim the list'))
					for (let r = 0; r < b.rows.length; r++) {
						const row = b.rows[r] as Record<string, unknown>
						str(row?.label, `${p}.rows[${r}].label`, 'label')
						str(row?.value, `${p}.rows[${r}].value`, 'value')
					}
					break
				}
				case 'table': {
					if (!Array.isArray(b.columns) || !b.columns.every((c) => typeof c === 'string'))
						f.push(finding(`${p}.columns`, 'is not a string array', 'send column names'))
					if (!Array.isArray(b.rows)) f.push(finding(`${p}.rows`, 'is not an array', 'send rows'))
					else {
						if (b.rows.length > MESSAGE_BLOCK_LIMITS.maxRows)
							f.push(finding(`${p}.rows`, `more than ${MESSAGE_BLOCK_LIMITS.maxRows} rows`, 'trim the table'))
						for (let r = 0; r < b.rows.length; r++)
							if (!Array.isArray(b.rows[r]) || !(b.rows[r] as unknown[]).every((c) => typeof c === 'string'))
								f.push(finding(`${p}.rows[${r}]`, 'is not a string array', 'send cell text'))
					}
					break
				}
				case 'stat':
					str(b.label, `${p}.label`, 'label')
					if (typeof b.value !== 'number' || !Number.isFinite(b.value))
						f.push(finding(`${p}.value`, 'is not a number', 'send a finite number'))
					if (b.max !== undefined && (typeof b.max !== 'number' || !Number.isFinite(b.max)))
						f.push(finding(`${p}.max`, 'is not a number', 'send a finite number, or omit it'))
					break
				case 'image':
					if (!Number.isInteger(b.assetId))
						f.push(
							finding(
								`${p}.assetId`,
								'is not a session-asset id',
								'attach the bytes first; blocks reference assets, never foreign URLs',
							),
						)
					break
				case 'choices': {
					if (!Array.isArray(b.actions) || !b.actions.length) {
						f.push(finding(`${p}.actions`, 'is empty or not an array', 'send at least one action'))
						break
					}
					if (b.actions.length > MESSAGE_BLOCK_LIMITS.maxActions)
						f.push(
							finding(`${p}.actions`, `more than ${MESSAGE_BLOCK_LIMITS.maxActions} actions`, 'fewer, clearer choices'),
						)
					formFields(b, p)
					const choices = new Set<string>()
					for (let a = 0; a < b.actions.length; a++) {
						const act = b.actions[a] as Record<string, unknown>
						str(act?.fn, `${p}.actions[${a}].fn`, 'fn')
						identity(act?.action, `${p}.actions[${a}].action`)
						str(act?.label, `${p}.actions[${a}].label`, 'label')
						if (act?.choice !== undefined) {
							if (typeof act.choice !== 'string' || !act.choice)
								f.push(
									finding(
										`${p}.actions[${a}].choice`,
										'is not an option key',
										'name the option with a non-empty string, or omit it',
									),
								)
							else if (choices.has(act.choice))
								f.push(
									finding(
										`${p}.actions[${a}].choice`,
										`repeats the option key '${act.choice}'`,
										'give each option its own key — an answer names one',
									),
								)
							else choices.add(act.choice)
						} else if (b.addressee !== undefined)
							f.push(
								finding(
									`${p}.actions[${a}].choice`,
									'is missing on an addressed question',
									"give each option a 'choice' key — a form's answer names one, and the oracle's schema is an enum of them",
								),
							)
					}
					break
				}
				case 'form': {
					str(b.fn, `${p}.fn`, 'fn')
					identity(b.action, `${p}.action`)
					formFields(b, p)
					if (!b.fields || typeof b.fields !== 'object' || Array.isArray(b.fields))
						f.push(finding(`${p}.fields`, 'is not a settings schema', 'declare fields with the one field language'))
					else
						for (const sf of checkSchema(b.fields as SettingsSchema))
							f.push(finding(`${p}.fields.${sf.field ?? ''}`, sf.message, sf.fix))
					break
				}
				case 'group':
					if (!Array.isArray(b.blocks))
						f.push(finding(`${p}.blocks`, 'is not an array', 'nest an array of blocks'))
					else walk(b.blocks, `${p}.blocks`, depth + 1)
					break
				default:
					f.push(
						finding(
							p,
							`unknown block kind '${String(b.kind)}'`,
							'use one of: md, kv, table, stat, image, choices, form, group',
						),
					)
			}
		}
	}

	walk(value, 'blocks', 1)
	return f
}

/**
 * Stamp each `choices` button and `form` in a tree with the identity of the
 * declaration it fires — the outlet's half of W-E, called where a block part
 * is written with the run's spec in hand. That is the host's seam, not the
 * SDK's: in Serene Pub the executor's host scope carries the running
 * document's slug (`runtime/host.ts`, `HostScope.specId`) and its message
 * outlet is where the stamp lands; the `blocks` port U5d builds is built on
 * this call. The SDK declares no `HostScope` — a host wired by hand passes
 * `{ id, contributes }` from wherever it keeps the running spec.
 *
 * The identity is `<spec id>#<key>` for the ONE action of `spec` whose
 * `function` is the block's `fn`. A block whose `fn` the spec declares no
 * action for, or several, is left unstamped — it fires as legacy and gets the
 * owner floor — rather than guessed; and a block that already carries an
 * `action` keeps it, so a spec may name a declaration of another spec's on
 * purpose. Returns a copy; the input is never mutated.
 */
export function stampBlockActions(
	blocks: MessageBlock[],
	spec: { id: string; contributes?: unknown },
): MessageBlock[] {
	const byFunction = new Map<string, string[]>()
	for (const a of actionsOf(spec)) {
		const list = byFunction.get(a.function) ?? []
		list.push(`${spec.id}#${a.key}`)
		byFunction.set(a.function, list)
	}
	const identityFor = (fn: string): string | undefined => {
		const found = byFunction.get(fn)
		return found && found.length === 1 ? found[0] : undefined
	}
	const stamp = <T extends BlockActionRef>(ref: T): T => {
		if (ref.action !== undefined) return ref
		const action = identityFor(ref.fn)
		return action === undefined ? ref : { ...ref, action }
	}
	const walk = (list: MessageBlock[]): MessageBlock[] =>
		list.map((b) => {
			switch (b.kind) {
				case 'choices':
					return { ...b, actions: b.actions.map(stamp) }
				case 'form':
					return stamp(b)
				case 'group':
					return { ...b, blocks: walk(b.blocks) }
				default:
					return b
			}
		})
	return walk(blocks)
}

/* ── Forms: what the host reads off a block tree (30 §U5d) ───────────────── */

/** One form in a block tree — a `choices` or `form` block, located. */
export type FormBlock = Extract<MessageBlock, { kind: 'choices' | 'form' }>

/**
 * Every `choices` and `form` block in a tree, in render order, groups
 * flattened — the blocks a fire, an event or an answer can name.
 */
export function formBlocksOf(blocks: MessageBlock[]): FormBlock[] {
	const out: FormBlock[] = []
	const walk = (list: MessageBlock[]): void => {
		for (const b of list) {
			if (b.kind === 'choices' || b.kind === 'form') out.push(b)
			else if (b.kind === 'group') walk(b.blocks)
		}
	}
	walk(blocks)
	return out
}

/** The form block carrying `id`, or undefined. */
export function findFormBlock(blocks: MessageBlock[], id: string): FormBlock | undefined {
	return formBlocksOf(blocks).find((b) => b.id === id)
}

/**
 * Every function a `choices` option or a `form` names, deduplicated — what
 * the writing spec must declare an action for. A block whose `fn` the spec
 * declares no action for is refused at the write: nothing would ever be held
 * to an audience for it.
 */
export function blockFunctionsOf(blocks: MessageBlock[]): string[] {
	const fns = new Set<string>()
	for (const b of formBlocksOf(blocks))
		if (b.kind === 'choices') for (const a of b.actions) fns.add(a.fn)
		else fns.add(b.fn)
	return [...fns]
}

/**
 * The functions a tree names that `spec` declares no action for — the
 * refusal the host makes before it stamps (`stampBlockActions` leaves such a
 * block unstamped rather than guessing; the write refuses it instead, with
 * the function named).
 */
export function undeclaredBlockFunctions(
	blocks: MessageBlock[],
	spec: { id: string; contributes?: unknown },
): string[] {
	const declared = new Set(actionsOf(spec).map((a) => a.function))
	return blockFunctionsOf(blocks).filter((fn) => !declared.has(fn))
}

/**
 * The effects line (plans/29 R-15 *The line*; 09-B F39): a block naming a
 * `world` action — one whose result touches cards, lorebooks, settings,
 * permissions, connections — is refused. Such an action lives in the
 * composer or the review gate and is owner-only; a message carrying it would
 * put an out-of-fiction effect where a character could be asked to answer
 * it. Returns the functions of the offending actions.
 */
export function worldBlockFunctions(
	blocks: MessageBlock[],
	spec: { id: string; contributes?: unknown },
): string[] {
	const world = new Set(
		actionsOf(spec)
			.filter((a) => effectsOf(a) === 'world')
			.map((a) => a.function),
	)
	return blockFunctionsOf(blocks).filter((fn) => world.has(fn))
}

/**
 * Stamp an `id` on every `choices` and `form` block that has none — the
 * host's half, at the write, with the host's id maker (a uuid). A block that
 * already carries one keeps it. Returns a copy; the input is never mutated.
 */
export function assignBlockIds(blocks: MessageBlock[], makeId: () => string): MessageBlock[] {
	const walk = (list: MessageBlock[]): MessageBlock[] =>
		list.map((b) => {
			switch (b.kind) {
				case 'choices':
				case 'form':
					return b.id ? b : { ...b, id: makeId() }
				case 'group':
					return { ...b, blocks: walk(b.blocks) }
				default:
					return b
			}
		})
	return walk(blocks)
}

/**
 * The JSON Schema an oracle answers a form against (R-15: "an oracle with
 * `json` capability answers against the form's schema").
 *
 *  - `choices` → `{ choice: <enum of the option keys> }`, required.
 *  - `form` → the field schema, mapped field by field (`fieldsToJsonSchema`).
 *
 * A `choices` block whose options carry no keys yields an empty enum, which
 * is what the validator refuses on an addressed block before it is written.
 */
export function formAnswerSchema(block: FormBlock): Record<string, unknown> {
	if (block.kind === 'choices')
		return {
			type: 'object',
			properties: {
				choice: {
					type: 'string',
					enum: block.actions.map((a) => a.choice).filter((c): c is string => !!c),
				},
			},
			required: ['choice'],
			additionalProperties: false,
		}
	return fieldsToJsonSchema(block.fields)
}

/**
 * The one field language as JSON Schema — for a `form` block's answer, and
 * for anything else that hands a `SettingsSchema` to a model. Every field
 * type maps; `secret` and `media` map to strings because that is what a
 * model could produce, and a form asking a character for either is a form
 * the author should not have written.
 */
export function fieldsToJsonSchema(fields: SettingsSchema): Record<string, unknown> {
	const properties: Record<string, unknown> = {}
	const required: string[] = []
	for (const [key, decl] of Object.entries(fields)) {
		properties[key] = fieldToJsonSchema(decl)
		if (decl.required) required.push(key)
	}
	return {
		type: 'object',
		properties,
		...(required.length ? { required } : {}),
		additionalProperties: false,
	}
}

function fieldToJsonSchema(decl: FieldDecl): Record<string, unknown> {
	const describe = typeof decl.description === 'string' ? { description: decl.description } : {}
	switch (decl.type) {
		case 'boolean':
			return { type: 'boolean', ...describe }
		case 'integer':
		case 'number':
			return {
				type: decl.type,
				...(decl.min !== undefined ? { minimum: decl.min } : {}),
				...(decl.max !== undefined ? { maximum: decl.max } : {}),
				...describe,
			}
		case 'enum': {
			const of = decl.of ?? decl.members?.map((m) => m.key) ?? []
			return { type: 'string', enum: [...of], ...describe }
		}
		case 'string[]':
			return { type: 'array', items: { type: 'string' }, ...describe }
		case 'list':
			return {
				type: 'array',
				items: decl.item ? fieldToJsonSchema(decl.item) : {},
				...(decl.min !== undefined ? { minItems: decl.min } : {}),
				...(decl.max !== undefined ? { maxItems: decl.max } : {}),
				...describe,
			}
		case 'object':
			return { ...fieldsToJsonSchema(decl.fields ?? {}), ...describe }
		case 'share':
		case 'perMember':
		case 'strengths':
			return {
				type: 'object',
				properties: Object.fromEntries((decl.members ?? []).map((m) => [m.key, { type: 'number' }])),
				additionalProperties: false,
				...describe,
			}
		default:
			return { type: 'string', ...describe }
	}
}

/**
 * The fire a form's answer becomes — what a press sends, and what the
 * answer pipeline commits "exactly as a click would": the block's function,
 * its stamped identity, and the payload. For `choices` the payload is
 * `{ choice }`; for `form` it is the answered values. Null when the answer
 * names no option the block offers, or is not an object — an oracle's
 * answer is checked here before anything is fired.
 */
export function formFireOf(
	block: FormBlock,
	answer: unknown,
): { fn: string; action?: string; payload: Record<string, unknown>; label?: string } | null {
	if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return null
	const a = answer as Record<string, unknown>
	if (block.kind === 'choices') {
		const option = block.actions.find((o) => o.choice !== undefined && o.choice === a.choice)
		if (!option) return null
		return {
			fn: option.fn,
			action: option.action,
			payload: { choice: option.choice as string },
			label: option.label,
		}
	}
	return { fn: block.fn, action: block.action, payload: { ...a } }
}
