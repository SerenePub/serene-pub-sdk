import type { ViteDevServer } from 'vite'

export interface SurfaceHarnessOptions {
	/** The package to preview — where its entry module and UI files live. */
	packageDir: string
	port?: number
	/** `true` binds all interfaces; a string binds that address. */
	host?: boolean | string
	open?: boolean
	/** JSON file replacing the built-in fixtures. */
	fixtures?: string
}

/** Start the surface harness. The caller owns the returned server's lifetime. */
export function startSurfaceHarness(opts: SurfaceHarnessOptions): Promise<ViteDevServer>
