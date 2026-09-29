/**
 * A plugin whose Task keeps state (D-2).
 *
 * Battleship declared all ten of its nodes as tasks, and every handler that
 * touched a board would have halted at install: by the grant table a task is
 * pure (F11) and is handed neither `storage` nor `fetch`. The mistake is
 * invisible in the harness, which endows what the author asks for.
 */

import { defineExtension, describeTaskDefinition, handler, ok, S } from '@serene-pub/sdk'

export const PLUGIN_SLUG = 'demo.task-storage'

export const keepBoard = describeTaskDefinition({
	id: 'demo.task-storage:task/keep-board@1',
	i18n: { name: { en: 'Keep the board' } },
	timeoutMs: 500,
	ports: { in: { sessionId: S.text }, out: { main: S.json } },
})

export default defineExtension({
	slug: PLUGIN_SLUG,
	name: 'Board keeper',
	version: '1.0.0',
	description: 'Remembers a board it is granted no room for.',
	handlers: [
		handler(keepBoard, async (input: { sessionId?: string }, ctx: any) => {
			const board = await ctx.storage.get(`s:${input.sessionId}:board`)
			return ok({ main: board ?? {} })
		}),
	],
	permissions: { storage: { quotaBytes: 1024 * 1024 } },
})
