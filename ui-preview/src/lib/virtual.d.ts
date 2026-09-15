declare module 'virtual:serene-pub/surfaces' {
	import type { PreviewManifest } from '@serene-pub/sdk'
	export const manifest: PreviewManifest
	export const packageDir: string
	/** target id → dev URL of the frame document. */
	export const frames: Record<string, string>
	/** target id → dynamic import of the component module. */
	export const components: Record<string, () => Promise<Record<string, unknown>>>
	/** Parsed `--fixtures` file, or null for the built-ins. */
	export const fixtureOverride: unknown
	/** Stock Skeleton theme names, read off the installed package. */
	export const themes: string[]
	/** Where the frame-tier token stylesheet is served. */
	export const themeCssPath: string
}
