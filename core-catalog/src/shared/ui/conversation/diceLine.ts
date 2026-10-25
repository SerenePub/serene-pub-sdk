/**
 * 🚧 A **dice line** (Lair rewrite D3, 2026-10-21): a message that is the
 * rules speaking — it carries a roll form (`roll`) or a dice result (`dice`),
 * or it is the answer to a roll form (a _No check_ line, `metadata.answersForm`
 * naming a `roll` block on a row the client holds). The Lair's Oracle writes
 * them. The messages widget marks the row `data-msg-dice-line`, and the
 * default widget stylesheet draws it as mechanics, not speech: framed, quiet,
 * its figures lined up — still under its speaker's face and name, because a
 * roll form is a question somebody answers.
 *
 * ⚠ Not a **table line** (`metadata.tableLine`, a Dungeon Crawler roll line
 * drawn in no voice) and not the table channel's rows: a dice line is an
 * ordinary line on its channel, in its speaker's voice.
 */

/** The block kinds that make a line a dice line. */
const DICE_KINDS = new Set(['roll', 'dice'])

type BlockLike = { kind?: unknown; id?: unknown; blocks?: unknown }

/** Does a block tree hold a roll form or a dice result, at any depth? 🚧 @experimental */
export function holdsDice(blocks: unknown, depth = 0): boolean {
	if (!Array.isArray(blocks) || depth > 3) return false
	for (const b of blocks as BlockLike[]) {
		if (!b || typeof b !== 'object') continue
		if (typeof b.kind === 'string' && DICE_KINDS.has(b.kind)) return true
		if (b.kind === 'group' && holdsDice(b.blocks, depth + 1)) return true
	}
	return false
}

/** The block trees a row's parts carry. */
const blockTreesOf = (row: DiceLineRow | null | undefined): unknown[] =>
	(row?.parts ?? [])
		.map((p) => (p?.data as { blocks?: unknown } | null | undefined)?.blocks)
		.filter((b): b is unknown[] => Array.isArray(b))

/** The block a tree holds by id, at any depth. */
function blockById(blocks: unknown, id: string, depth = 0): BlockLike | null {
	if (!Array.isArray(blocks) || depth > 3) return null
	for (const b of blocks as BlockLike[]) {
		if (!b || typeof b !== 'object') continue
		if (b.id === id) return b
		if (b.kind === 'group') {
			const inner = blockById(b.blocks, id, depth + 1)
			if (inner) return inner
		}
	}
	return null
}

/** Enough of a message row to tell a dice line by. 🚧 @experimental */
export interface DiceLineRow {
	id: number
	parts?: ReadonlyArray<{ data?: unknown } | null | undefined> | null
	metadata?: { answersForm?: { messageId?: unknown; blockId?: unknown } | null } | null
}

/**
 * Is this row a dice line? Its own blocks hold a roll form or a dice result,
 * or it answers a roll form on a row in `messages` (the rows the client
 * holds). 🚧 @experimental
 */
export function isDiceLine(
	row: DiceLineRow | null | undefined,
	messages: ReadonlyArray<DiceLineRow | null | undefined> = [],
): boolean {
	if (!row) return false
	if (blockTreesOf(row).some((tree) => holdsDice(tree))) return true
	const answers = row.metadata?.answersForm
	const askedOn = Number(answers?.messageId)
	const blockId = typeof answers?.blockId === 'string' ? answers.blockId : null
	if (!Number.isSafeInteger(askedOn) || !blockId) return false
	const asked = messages.find((m) => m?.id === askedOn)
	return blockTreesOf(asked).some((tree) => blockById(tree, blockId)?.kind === 'roll')
}
