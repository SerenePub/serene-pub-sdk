/**
 * The harness, guarded for a parallel suite. A mounted component holds a
 * worker thread, and a worker nobody terminates keeps its test file's
 * process alive forever — `tsx --test` then waits on that file and the whole
 * suite hangs with no output. It only takes one mount a test never reaches
 * `unmount()` for: an assertion that fails between mount and `try`, a mount
 * that was expected to be refused but succeeded, a step that never settles.
 *
 * So every mount made through here is tracked, and whatever a file leaves
 * mounted is unmounted in its `after` hook — the failure is reported, and
 * the process still exits. `test` carries a timeout so a step that never
 * settles fails by name instead of waiting forever.
 */
import { after, test as nodeTest, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mountComponent as rawMount, type MountComponentOptions, type MountedComponent } from '../cli/src/testing.js'

export type { MountComponentOptions, MountedComponent }

/** Long enough for a cold esbuild + worker bundle on a loaded machine; short enough to fail, not hang. */
export const HARNESS_TEST_TIMEOUT_MS = 120_000

const live = new Set<MountedComponent>()

after(async () => {
	for (const view of [...live]) await view.unmount().catch(() => {})
})

/** `mountComponent`, tracked: whatever a test leaves mounted is unmounted when the file ends. */
export async function mountComponent(opts: MountComponentOptions): Promise<MountedComponent> {
	const view = await rawMount(opts)
	live.add(view)
	const unmount = view.unmount.bind(view)
	let once: Promise<void> | undefined
	// Once only: a second unmount would hand the lent DOM back twice.
	view.unmount = () => {
		live.delete(view)
		return (once ??= unmount())
	}
	return view
}

/**
 * The mount must be refused, matching `pattern`. A mount that succeeds
 * instead is unmounted before the test fails — never left running.
 */
export async function assertRefusedMount(mounting: Promise<MountedComponent>, pattern: RegExp): Promise<void> {
	let view: MountedComponent | undefined
	try {
		view = await mounting
	} catch (e) {
		assert.match((e as Error).message, pattern)
		return
	}
	await view.unmount()
	assert.fail(`expected the mount to be refused (${pattern}), but it mounted`)
}

/** `node:test`'s `test`, with a timeout so a hung step fails instead of hanging the suite. */
export function test(name: string, fn: (t: TestContext) => void | Promise<void>): Promise<void> {
	return nodeTest(name, { timeout: HARNESS_TEST_TIMEOUT_MS }, fn)
}
