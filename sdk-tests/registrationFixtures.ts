/**
 * Fixtures for the layering restructure's suites (PLAN-layering lane 1,
 * 2026-10-20): a step that reads whatever it is wired to, and small
 * pipelines on each inlet that read chosen inlet ports — so fit, the
 * registration door and presets-as-changes have something real to judge.
 */
import { S, describeTaskDefinition, pin, spec, type BuiltSpec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/** Reads up to four values — any shape — and publishes nothing of note. */
export const Read = pin(
	describeTaskDefinition({
		id: 'test:task/lane1-read@1',
		timeoutMs: 1000,
		ports: { in: { a: S.json, b: S.json, c: S.json, d: S.json }, out: { main: S.json } },
	}),
)

const wire = (ports: readonly string[]) => ($: any) =>
	(Read as any).v1(Object.fromEntries(ports.map((p, i) => [['a', 'b', 'c', 'd'][i], $.input[p]])))

/** A pipeline on the user-message inlet reading `ports`, mounted by registrations (`{ suits }`). */
export function onUserMessage(id: string, ports: readonly string[], name?: string): BuiltSpec {
	return spec(id, { version: '1.0.0', ...(name ? { i18n: { name: { en: name } } } : {}) })
		.inlet('input', C.userMessage.v1(), { suits: [] })
		.task('read', wire(ports) as any)
		.build()
}

/** A pipeline on the routine inlet reading `ports`. */
export function onRoutine(id: string, ports: readonly string[], name?: string): BuiltSpec {
	return spec(id, { version: '1.0.0', ...(name ? { i18n: { name: { en: name } } } : {}) })
		.inlet('input', C.routine.v1(), { suits: [] })
		.task('read', wire(ports) as any)
		.build()
}

/** A pipeline on the session-event inlet reading `ports`. */
export function onSessionEvent(id: string, ports: readonly string[]): BuiltSpec {
	return spec(id, { version: '1.0.0' })
		.inlet('input', C.sessionEvent.v1(), { suits: [] })
		.task('read', wire(ports) as any)
		.build()
}
