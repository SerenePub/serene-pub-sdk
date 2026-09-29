/**
 * The registered type surfaces, for schema-aware generators.
 *
 * Lifted out of `bin.ts` because it is no longer only the CLI's: the docs
 * compiler's consumer calls `renderAnnouncementDocs(announcement, typeOf)`
 * directly, and the `typeOf` it has to pass is exactly this. Importing a
 * module whose side effect is `main()`'s argv handling to get one lookup
 * function is not a thing to ask of a caller.
 */
import type { TypeSurface } from './scaffold.js'

/** @internal */
export async function typeSurfaces(): Promise<
	(definitionId: string, version: number) => TypeSurface | undefined
> {
	const { allDefinitions, allScriptKinds, snapshotRegistry } = await import('@serene-pub/sdk')
	await import('@serene-pub/contracts')
	const entries = snapshotRegistry([...allDefinitions(), ...allScriptKinds()], {
		release: 'cli',
	}) as any[]
	return (definitionId: string, version: number) =>
		entries.find((e) => e.id === definitionId && e.version === version)
}
