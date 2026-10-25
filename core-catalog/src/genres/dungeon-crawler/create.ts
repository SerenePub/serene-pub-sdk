/**
 * 🚧 Dungeon Crawler's create pipeline and its welcome (PLAN-dungeon-crawler-2026-10-14,
 * features 1, 9 and 16): the tavern opens, everyone gets a Planner lane.
 */

import { compile, slot, spec, sessionEvents, coreEvents, ITEM, type OutPortsOf, type SpecBuilder } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { dungeonCrawlerGenre } from '../../registry/genres.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, DUNGEON_CRAWLER_PLANNER_KEY, DUNGEON_CRAWLER_STORY_CHANNEL, PARLEY_CHANNEL } from './names.js'
import { DUNGEON_CRAWLER_LANES_SCRIPT } from './scripts.js'
import { applyWiring, jsonPart, scriptStep, textPart, wiring, type Plus, type ReadOn, type Wiring } from './calls.js'
import { crawlTimeSlot, difficultySlot, goalModeSlot } from '../../registry/slots.js'

/** @experimental */
export const DUNGEON_CRAWLER_CREATE_SPEC_ID = 'core:spec/dungeon-crawler-create'
/** @experimental */
export const DUNGEON_CRAWLER_WELCOME_SPEC_ID = 'core:spec/dungeon-crawler-welcome'
/** @internal */
export const DUNGEON_CRAWLER_CREATE_VERSION = '1.0.0'

/** The Planner, as a participant reference — the name its every row carries. @experimental */
export const PLANNER = `envoy:${DUNGEON_CRAWLER_PLANNER_KEY}` as const

/**
 * 🚧 What a person's Story composer says while it waits for their character
 * (owner ruling 2026-10-15): closed when their Planner lane opens, opened by
 * the interview once their sheet is applied AND the world is built
 * (`interview.ts`, AUDIT A10: a guest once typed on an empty Story).
 * @experimental
 */
export const DUNGEON_CRAWLER_STORY_WAITING = 'Make your character on the Planner tab first.'

/**
 * 🚧 What a person's Story composer says once their character is made but the
 * world is not built yet (AUDIT A10). @experimental
 */
export const DUNGEON_CRAWLER_STORY_WAITING_FOR_WORLD = 'Your character is ready: the story starts once the world is built.'

/**
 * 🚧 Where the genre's own clock starts (★C): day one of year one, at eight in
 * the morning. A story time with no calendar behind it — free-form, as the
 * shape allows.
 * @experimental
 */
export const DUNGEON_CRAWLER_EPOCH = '1-01-01 08:00'

/**
 * **Open every missing Planner lane, and greet each** — the create's and the
 * welcome's shared tail. `core:script/dungeon-crawler-lanes` reads the
 * settings document (the owner, the guests, the seats, the lane register)
 * and hands back one entry per person with no Planner lane yet; each is
 * asked of **core** in turn (`core:query/channel-lane@1`, owner ruling
 * 2026-10-17 — `parley` is declared `lanes: 'personal'`), sequentially so
 * the owner, first, has lane 1 on a new session, and greeted only on a lane
 * that ask `opened`. The greetings are written only while the Planner is
 * seated (`welcome.text`, the envoy greeting's own seat check). The owner's
 * greeting is the Planner's declared one (interpolated); anyone else's is
 * the script's line, since the world's first question is the owner's
 * alone. Each row carries its first question as a form addressed to that
 * person.
 */
const openLanes = <B extends SpecBuilder<{ welcome: Ports<typeof C.envoyGreeting.v1> }, any>>(
	c: B,
	w: Wiring,
	session: ReadOn<B>,
	scope: ReadOn<B>,
): Plus<B, 'lanes', Ports<typeof C.runScript.v1>> => {
	const spine: SpecBuilder<{ welcome: Ports<typeof C.envoyGreeting.v1> }, any> = c
	scriptStep(spine, w, 'lanes', DUNGEON_CRAWLER_LANES_SCRIPT.seedKey, ($) => ({ session: session($ as never) }), 'Who to greet on a Planner lane')
		.junction('opened', { on: ($) => $.lanes.main }, (j) =>
			j.when('greet', { path: (v: Lanes) => v.greet, truthy: true }, (g) =>
				jsonPart(g, w, 'list', ($) => $.lanes.main, 'greet', 'The people to greet').junction(
					'planner',
					{ on: ($) => $.welcome.text },
					(p) =>
						p.when('seated', { truthy: true }, (s) =>
							s.each(
								'lane',
								{ over: ($) => $.opened.greet.list.main, max: 16, mode: 'sequential' },
								/**
								 * One person's lane: core opens it (or answers the one they have), and an
								 * opened lane is greeted with its question and the line. An `each` keys its
								 * members under `<clause>.item.`, beside the item itself.
								 *
								 * A player's greeting is read HERE, beside the person, and not inside the
								 * junction's branch: a branch inside an `each` does not see the item, so
								 * a guest's lane opened with its question and no greeting (round 2).
								 */
								(m) =>
									jsonPart(
										jsonPart(
											textPart(textPart(m, w, 'addressee', ($) => $[ITEM], 'addressee', 'Whose lane'), w, 'line', ($) => $[ITEM], 'text', "A player's greeting"),
											w,
											'blocks',
											($) => $[ITEM],
											'blocks',
											"The lane's first question",
										),
										w,
										'owner',
										($) => $[ITEM],
										'owner',
										"Whether it is the owner's lane",
									)
										.query(
											'mine',
											($) =>
												C.channelLane.v1({
													scope: scope($ as never) as any,
													channel: PARLEY_CHANNEL,
													person: $.addressee.text,
												}),
											{ expose: { label: 'Open their Planner lane' } },
										)
										.junction('fresh', { on: ($) => $.mine }, (f) =>
											f.when('opened', { path: (v: Lane) => v.opened, truthy: true }, (o) =>
												// 🚧 Their Story composer waits for their character (owner ruling
												// 2026-10-15): closed as their lane opens, opened by the
												// interview's sheet.
												o
													.outlet(
														'closeStory',
														($) =>
															C.setComposerState.v1({
																channel: DUNGEON_CRAWLER_STORY_CHANNEL,
																open: false as any,
																reason: DUNGEON_CRAWLER_STORY_WAITING,
																person: $.opened.greet.planner.seated.lane.item.addressee.text,
															}),
														{ expose: { label: 'Close their Story until their character is made' } },
													)
													.junction('who', { on: ($) => $.opened.greet.planner.seated.lane.item.owner.main }, (j) =>
														j
															.when('owner', { truthy: true }, (ow) =>
																ow.outlet(
																	'write',
																	($) =>
																		C.createMessage.v1({
																			text: $.welcome.text,
																			channel: $.opened.greet.planner.seated.lane.item.mine.lane,
																			speaker: PLANNER as any,
																			blocks: $.opened.greet.planner.seated.lane.item.blocks.main,
																		}),
																	{ expose: { label: 'Greet the owner' } },
																),
															)
															.otherwise('player', (pl) =>
																pl.outlet(
																	'write',
																	($) =>
																		C.createMessage.v1({
																			text: $.opened.greet.planner.seated.lane.item.line.text,
																			channel: $.opened.greet.planner.seated.lane.item.mine.lane,
																			speaker: PLANNER as any,
																			blocks: $.opened.greet.planner.seated.lane.item.blocks.main,
																		}),
																	{ expose: { label: 'Greet a player' } },
																),
															),
													),
											),
										),
							),
						),
				),
			),
		)
	return c as never
}

type Ports<F extends (...args: never[]) => unknown> = OutPortsOf<ReturnType<F>>

/** What the lanes script hands its junctions (`DUNGEON_CRAWLER_LANES_SCRIPT`): who to greet, who to ask. */
interface Lanes {
	readonly greet: unknown
	readonly ask: unknown
}

/** A person's lane, as core answered the ask (`core:query/channel-lane@1`). */
interface Lane {
	readonly opened: unknown
	readonly lane: unknown
}

/**
 * **Create** — the genre's one required pipeline (24 §3).
 *
 * No model call (the Lair's argument: creation is a press a person waits
 * on). It writes, in order:
 *
 *  - the table's rules on the world, through state so a retake could undo
 *    them like any write: difficulty *fair*, goal *shared*, and the crawl's
 *    clock at its epoch (`DUNGEON_CRAWLER_EPOCH`) — the interview moves the
 *    first two. Whether numbers and dice count is the session's rigour (How
 *    strict, set at creation), never asked again (walk 6, 2026-10-17); an
 *    older session's `stat-mode` stays readable and is read by nothing;
 *  - the genre's annex keys, blank (`progress`, `journal`, the Planner's
 *    notes) — a literal, so the keys it writes are named. The world itself
 *    is not here: it is the session's own lorebook, made by genesis's first
 *    place;
 *  - a Planner lane per person, opened by core (`core:query/channel-lane@1`):
 *    lane 1 of `parley` for the owner, asked first, `parley:<n>` for each
 *    guest and seated player, each greeted with its first question as a form
 *    (the owner: the world's shape, or Just play).
 * @experimental
 */
export const dungeonCrawlerCreateSpec = () => {
	const w = wiring()
	const graph = spec(DUNGEON_CRAWLER_CREATE_SPEC_ID, {
		version: DUNGEON_CRAWLER_CREATE_VERSION,
		taxonomy: { role: 'create' },
		genre: {
			name: dungeonCrawlerGenre.name,
			family: dungeonCrawlerGenre.family,
			description: dungeonCrawlerGenre.description,
			shape: dungeonCrawlerGenre.shape,
			events: dungeonCrawlerGenre.events as Record<string, { required?: boolean; open?: boolean }>,
			playerLabel: dungeonCrawlerGenre.playerLabel,
			envoys: dungeonCrawlerGenre.envoys,
		},
	})
		.inlet('input', C.sessionCreated.v1(), { suits: [coreEvents.sessionCreated] })
		/** The Planner's greeting, interpolated — empty when it is not seated. */
		.query('welcome', ($) => C.envoyGreeting.v1({ scope: $.input.sessionScope, params: slot.params() }))
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
		.query('rules', ($) =>
			C.resolveStateChanges.v1({
				changes: [
					{ owner: 'world', slot: difficultySlot.id, value: 'fair' },
					{ owner: 'world', slot: goalModeSlot.id, value: 'shared' },
					{ owner: 'world', slot: crawlTimeSlot.id, value: DUNGEON_CRAWLER_EPOCH },
				] as any,
				scope: $.input.sessionScope,
				base: $.state.version,
			}),
		)
		.task('apply', ($) =>
			C.setState.v1({
				changes: $.rules.changes,
				scope: $.input.sessionScope,
				base: $.state.version,
				params: slot.params(),
			}),
		)
		.outlet(
			'blank',
			() =>
				C.setSessionAnnex.v1({
					value: {
						[K.progress]: {},
						[K.journal]: { goal: '', leads: [] },
						[K.planningNotes]: '',
					} as any,
					params: slot.params(),
				}),
			{ expose: { label: "Write the genre's blank keys" } },
		)
	const built = openLanes(graph, w, ($) => $.input.session, ($) => $.input.sessionScope)
	return compile(
		built
			.defaults((p) =>
				applyWiring(p.params('welcome', { envoy: DUNGEON_CRAWLER_PLANNER_KEY }).params('apply', { mode: 'apply' }), w),
			)
			.build(),
	)
}

/**
 * 🚧 The standing order asked of the one who played alone, when the table
 * grows past one (PLAN-sheet-widget-redesign §14): each entry of the lanes
 * script's `ask` — `{ addressee, lane, text, blocks }` — as a Planner line on
 * that person's own lane, its form the question. Only while the Planner is
 * seated, as the greetings are. Read beside the item, as `greetLane` does.
 */
const askStandingOrders = <B extends SpecBuilder<{ welcome: Ports<typeof C.envoyGreeting.v1>; lanes: Ports<typeof C.runScript.v1> }, any>>(
	c: B,
	w: Wiring,
): B => {
	const spine: SpecBuilder<{ welcome: Ports<typeof C.envoyGreeting.v1>; lanes: Ports<typeof C.runScript.v1> }, any> = c
	spine.junction('standing', { on: ($) => $.lanes.main }, (j) =>
		j.when('asked', { path: (v: Lanes) => v.ask, truthy: true }, (a) =>
			jsonPart(a, w, 'list', ($) => $.lanes.main, 'ask', 'Who is asked their standing order').junction(
				'planner',
				{ on: ($) => $.welcome.text },
				(p) =>
					p.when('seated', { truthy: true }, (s) =>
						s.each('player', { over: ($) => $.standing.asked.list.main, max: 16 }, (m) =>
							jsonPart(
								textPart(textPart(m, w, 'lane', ($) => $[ITEM], 'lane', 'Their lane'), w, 'line', ($) => $[ITEM], 'text', 'Why they are asked'),
								w,
								'blocks',
								($) => $[ITEM],
								'blocks',
								'The standing order, asked',
							).outlet(
								'write',
								($) =>
									C.createMessage.v1({
										text: $.line.text,
										channel: $.lane.text,
										speaker: PLANNER as any,
										blocks: $.blocks.main,
									}),
								{ expose: { label: 'Ask their standing order' } },
							),
						),
					),
			),
		),
	)
	return c
}

/**
 * 🚧 **Welcome** — somebody new at the table (`member-added`): a player seat
 * opened (a persona picked, a seat named), a guest added, or a character
 * joined. Opens the Planner lane of every person who has none yet and greets
 * them there, the create's own tail; a member who already has a lane (a
 * companion, a second seat) opens nothing and writes nothing. When the table
 * grows past one person, the one who played alone is asked their standing
 * order on their own lane (§14, `askStandingOrders`).
 *
 * ⚠ A guest added in session settings is no member event: their lane opens
 * at the next one (their seat opening, usually). A person's lane is never
 * closed: a departed player's talk stays where it was.
 * @experimental
 */
export const dungeonCrawlerWelcomeSpec = () => {
	const w = wiring()
	const graph = spec(DUNGEON_CRAWLER_WELCOME_SPEC_ID, {
		version: DUNGEON_CRAWLER_CREATE_VERSION,
		taxonomy: { role: 'maintenance' },
	})
		.inlet('event', C.sessionEvent.v1(), { suits: [coreEvents.memberAdded] })
		.query('welcome', ($) => C.envoyGreeting.v1({ scope: $.event.sessionScope, params: slot.params() }))
	const built = askStandingOrders(openLanes(graph, w, ($) => $.event.session, ($) => $.event.sessionScope), w)
	return compile(
		built
			.defaults((p) =>
				applyWiring(p.params('welcome', { envoy: DUNGEON_CRAWLER_PLANNER_KEY }), w),
			)
			.build(),
	)
}
