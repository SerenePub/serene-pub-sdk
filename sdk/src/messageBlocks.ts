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

import type { SettingsSchema } from './settings.js'
import { checkSchema } from './settings.js'

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
	 */
	| {
			kind: 'choices'
			actions: Array<{ fn: string; label: string; icon?: string }>
	  }
	/**
	 * A form rendered from the one field language (`SettingsSchema`);
	 * submitting fires `fn` with the entered values as the payload.
	 */
	| { kind: 'form'; fields: SettingsSchema; fn: string; label?: string }
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
					for (let a = 0; a < b.actions.length; a++) {
						const act = b.actions[a] as Record<string, unknown>
						str(act?.fn, `${p}.actions[${a}].fn`, 'fn')
						str(act?.label, `${p}.actions[${a}].label`, 'label')
					}
					break
				}
				case 'form': {
					str(b.fn, `${p}.fn`, 'fn')
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
