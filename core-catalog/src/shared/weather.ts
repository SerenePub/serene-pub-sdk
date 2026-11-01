/**
 * 🚧 **The day's weather** — `core:spec/weather` (M0, lane T5; SHAPES
 * L3, COHERENCE F4): a **routine** that, once the story day has turned, picks
 * the day's weather — deterministically from (session, story day), no model —
 * and writes it to `core:slot/weather@1` on the world. Off until a genre
 * registers it: `register(afterEachDay(), weatherSpec())`.
 *
 * ⏳ SHAPES names this `core:routine/weather@1`, an id kind this codebase has
 * not got — a routine is a registration of a pipeline (R5: the SHAPES word is
 * reconciled here, never merged). SHAPES' `settings: { kinds, outdoorPenalty?,
 * byRegion? }` is HELD: a routine spec has no settings home yet, and
 * `byRegion` needs a places read. The kinds are `weatherSlot`'s declared
 * `config.of`, read when the spec is built.
 *
 * ## The pick
 * FNV-1a 32-bit of the text `${sessionId}|${year}-${month}-${day}` (the
 * routine cause's `clock.to`; an absent part reads as empty), index
 * `hash % kinds.length`. With no clock the run writes nothing. The write is
 * one change through `resolve-state-changes@1` → `set-state@1` with
 * `mode: 'apply'` (the Lair's Nudge pattern): the host keeps the world's
 * weather on the lorebook (a world-scope slot, lane T3).
 *
 * ⚠ The script below is a seeded row (`CORE_SCRIPTS`, `seed/scripts.ts`):
 * lane T5 could not list it there (that file is another programme's), so the
 * supervisor adds `WEATHER_PICK_SCRIPT` to it; until then the host drops the
 * seed key from the chain with a warning.
 * @experimental
 */
import { compile, coreEvents, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { applyWiring, scriptStep, wiring } from './calls.js'
import { seedScript } from './scriptSeed.js'
import { weatherSlot } from '../registry/slots.js'

/** @experimental */
export const WEATHER_SPEC_ID = 'core:spec/weather'
/** @internal */
export const WEATHER_VERSION = '1.0.0'

/**
 * `core:script/weather-pick`: handed `{ session, clock, kinds }` (the routine's
 * session document, the cause's clock `{ from, to }` and the kinds to choose
 * from); returns the list of changes to write — one, or none with no clock.
 * @experimental
 */
export const WEATHER_PICK_SCRIPT = seedScript(
	'core:script/weather-pick',
	'Weather: the day\'s pick',
	`
var v = value || {};
var to = v.clock && typeof v.clock === "object" ? v.clock.to : null;
var kinds = Array.isArray(v.kinds) ? v.kinds : [];
if (!to || typeof to !== "object" || !kinds.length) return [];
var doc = v.session && typeof v.session === "object" ? v.session : {};
function part(x) { return x === null || x === undefined ? "" : String(x); }
var text = part(doc.sessionId) + "|" + part(to.year) + "-" + part(to.month) + "-" + part(to.day);
var h = 0x811c9dc5;
for (var i = 0; i < text.length; i++) {
	h ^= text.charCodeAt(i);
	h = Math.imul(h, 0x01000193) >>> 0;
}
return [{ owner: "world", slot: "core:slot/weather@1", value: kinds[(h >>> 0) % kinds.length] }];
`,
)

/** The kinds the pick chooses from: the weather slot's declared choices. @internal */
export const weatherKinds = (): string[] => [...((weatherSlot.config as { of?: readonly string[] } | undefined)?.of ?? [])]

/** @experimental */
export const weatherSpec = () => {
	const w = wiring()
	const kinds = weatherKinds()
	const head = spec(WEATHER_SPEC_ID, {
		version: WEATHER_VERSION,
		taxonomy: { role: 'maintenance' },
	})
		/** A routine on a day turning: the session and the clock `{ from, to }` it carried. */
		.inlet('input', C.routine.v1(), { suits: [coreEvents.storyClockMoved] })
	const picked = scriptStep(
		head,
		w,
		'pick',
		WEATHER_PICK_SCRIPT.seedKey,
		($) => ({ session: $.input.session, clock: $.input.clock, kinds }),
		"Pick the day's weather",
	)
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
		.query('resolve', ($) =>
			C.resolveStateChanges.v1({
				changes: $.pick.main as any,
				scope: $.input.sessionScope,
				base: $.state.version,
			}),
		)
		.task('apply', ($) =>
			C.setState.v1({
				changes: $.resolve.changes,
				scope: $.input.sessionScope,
				base: $.state.version,
				params: slot.params(),
			}),
		)
	return compile(picked.defaults((p) => applyWiring(p, w).params('apply', { mode: 'apply' })).build())
}
