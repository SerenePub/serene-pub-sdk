/**
 * Who spoke a message, as far as the row itself says. An envoy's row names
 * its speaker by reference (`metadata.speaker = envoy:<slug>`, plans/29 R-18)
 * and holds no `characterId`; a host resolves characters and personas from
 * its own participant links.
 */

/** The slug of an envoy's message — `metadata.speaker` as `envoy:<slug>` — or null. @experimental */
export function messageEnvoySlug(msg: { metadata?: unknown }): string | null {
	const ref = (msg.metadata as { speaker?: unknown } | null | undefined)?.speaker
	return typeof ref === 'string' && ref.startsWith('envoy:') ? ref.slice('envoy:'.length) : null
}
