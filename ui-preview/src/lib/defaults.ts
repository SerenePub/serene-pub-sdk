/**
 * A schema's shipped defaults, through the SDK's own settings entry point so
 * "unset inherits the shipped default" means here exactly what it means at
 * install. `defineSettings` validates as it builds, and a modder halfway
 * through writing a schema must not get a blank page for it — so a refusal
 * degrades to "no defaults" and the form still renders.
 */
import { defineSettings, type SettingsSchema } from '@serene-pub/sdk'

export function defaultsOf(schema: SettingsSchema): Record<string, unknown> {
	try {
		return defineSettings(schema as never).defaults()
	} catch {
		return {}
	}
}
