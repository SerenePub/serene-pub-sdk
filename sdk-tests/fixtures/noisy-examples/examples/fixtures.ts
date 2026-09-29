/**
 * The stand-in host this package's examples run against — not the plugin.
 *
 * It commits and it calls a model because an example has to show a whole run;
 * neither is a reach the installed plugin has, and a permission list that
 * says otherwise is a permission list nobody reads.
 */

export const exampleHost = () => {
	const rows: unknown[] = []
	const ctx = {
		commit: async (table: string, row: unknown) => {
			rows.push({ table, row })
			return { status: 'committed' as const }
		},
		call: async (_request: unknown) => ({ text: 'a reply the example prints' }),
	}
	return {
		rows,
		run: async () => {
			await ctx.commit('messages', { text: 'hello' })
			return ctx.call({ prompt: 'hello' })
		},
	}
}
