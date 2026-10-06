/**
 * A spec document built once, on first use. Internal: never re-exported.
 */

import type { SpecDocument } from '@serene-pub/sdk'

/** Built once, on first use — a preset reads it at import, `CORE_SPECS` whenever it publishes. */
export const once = (build: () => SpecDocument): (() => SpecDocument) => {
	let doc: SpecDocument | undefined
	return () => (doc ??= build())
}
