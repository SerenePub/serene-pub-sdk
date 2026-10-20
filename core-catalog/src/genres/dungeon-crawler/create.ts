/**
 * 🚧 Dungeon Crawler's create pipeline and its welcome (PLAN-dungeon-crawler-2026-10-14,
 * features 1, 9 and 16): the tavern opens, everyone gets a Planner lane.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { dungeonCrawlerGenre } from '../../registry/genres.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, DUNGEON_CRAWLER_PLANNER_KEY, DUNGEON_CRAWLER_STORY_CHANNEL, PARLEY_CHANNEL } from './names.js'
import { DUNGEON_CRAWLER_LANES_SCRIPT } from './scripts.js'
import { applyWiring, at, jsonPart, scriptStep, textPart, wiring, type Wiring } from './calls.js'

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
const openLanes = (c: any, w: Wiring, session: ($: any) => unknown, scope: ($: any) => unknown) =>
	scriptStep(c, w, '', 'lanes', DUNGEON_CRAWLER_LANES_SCRIPT.seedKey, ($) => ({ session: session($) }), 'Who to greet on a Planner lane')
		.junction('opened', { on: ($: any) => $.lanes.main }, (j: any) =>
			j.when('greet', { path: 'greet', truthy: true }, (g: any) =>
				jsonPart(g, w, 'opened.greet.', 'list', ($) => $.lanes.main, 'greet', 'The people to greet').junction(
					'planner',
					{ on: ($: any) => $.welcome.text },
					(p: any) =>
						p.when('seated', { truthy: true }, (s: any) =>
							s.each(
								'lane',
								{ over: ($: any) => $.opened.greet.list.main, max: 16, mode: 'sequential' },
								(m: any) => greetLane(m, w, 'opened.greet.planner.seated.lane', scope),
							),
						),
				),
			),
		)

/**
 * One person's lane: core opens it (or answers the one they have), and an
 * opened lane is greeted with its question and the line. An `each` keys its
 * members under `<clause>.item.`, beside the item itself.
 */
const greetLane = (m: any, w: Wiring, clause: string, scope: ($: any) => unknown) => {
	const item = ($: any) => at($, `${clause}.item`)
	const prefix = `${clause}.item.`
	// A player's greeting is read HERE, beside the person, and not inside the
	// junction's branch: a branch inside an \`each\` does not see the item, so
	// a guest's lane opened with its question and no greeting (round 2).
	const withWho = textPart(m, w, prefix, 'addressee', item, 'addressee', 'Whose lane')
	const withLine = textPart(withWho, w, prefix, 'line', item, 'text', "A player's greeting")
	const withBlocks = jsonPart(withLine, w, prefix, 'blocks', item, 'blocks', "The lane's first question")
	const withOwner = jsonPart(withBlocks, w, prefix, 'owner', item, 'owner', "Whether it is the owner's lane")
	const asked = withOwner.query(
		'mine',
		($: any) =>
			C.channelLane.v1({
				scope: scope($) as any,
				channel: PARLEY_CHANNEL,
				person: at($, `${prefix}addressee`).text,
			}),
		{ expose: { label: 'Open their Planner lane' } },
	)
	return asked.junction('fresh', { on: ($: any) => at($, `${prefix}mine`) }, (f: any) =>
		f.when('opened', { path: 'opened', truthy: true }, (o: any) =>
			// 🚧 Their Story composer waits for their character (owner ruling
			// 2026-10-15): closed as their lane opens, opened by the
			// interview's sheet.
			o
				.outlet(
					'closeStory',
					($: any) =>
						C.setComposerState.v1({
							channel: DUNGEON_CRAWLER_STORY_CHANNEL,
							open: false as any,
							reason: DUNGEON_CRAWLER_STORY_WAITING,
							person: at($, `${prefix}addressee`).text,
						}),
					{ expose: { label: 'Close their Story until their character is made' } },
				)
				.junction('who', { on: ($: any) => at($, `${prefix}owner`).main }, (j: any) =>
					j
						.when('owner', { truthy: true }, (ow: any) =>
							ow.outlet(
								'write',
								($: any) =>
									C.createMessage.v1({
										text: $.welcome.text,
										channel: at($, `${prefix}mine`).lane,
										speaker: PLANNER as any,
										blocks: at($, `${prefix}blocks`).main,
									}),
								{ expose: { label: 'Greet the owner' } },
							),
						)
						.otherwise('player', (pl: any) =>
							pl.outlet(
								'write',
								($: any) =>
									C.createMessage.v1({
										text: at($, `${prefix}line`).text,
										channel: at($, `${prefix}mine`).lane,
										speaker: PLANNER as any,
										blocks: at($, `${prefix}blocks`).main,
									}),
								{ expose: { label: 'Greet a player' } },
							),
						),
				),
		),
	)
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
		.inlet('input', C.sessionCreated.v1(), {
			genre: dungeonCrawlerGenre,
			event: sessionEvents.sessionCreated,
		})
		/** The Planner's greeting, interpolated — empty when it is not seated. */
		.query('welcome', ($) => C.envoyGreeting.v1({ scope: $.input.sessionScope, params: slot.params() }))
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
		.query('rules', ($) =>
			C.resolveStateChanges.v1({
				changes: [
					{ owner: 'world', slot: 'core:slot/difficulty@1', value: 'fair' },
					{ owner: 'world', slot: 'core:slot/goal-mode@1', value: 'shared' },
					{ owner: 'world', slot: 'core:slot/crawl-time@1', value: DUNGEON_CRAWLER_EPOCH },
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
			.preset('dungeon-crawler', { label: 'Dungeon Crawler', default: true }, (p: any) =>
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
const askStandingOrders = (c: any, w: Wiring) =>
	c.junction('standing', { on: ($: any) => $.lanes.main }, (j: any) =>
		j.when('asked', { path: 'ask', truthy: true }, (a: any) =>
			jsonPart(a, w, 'standing.asked.', 'list', ($) => $.lanes.main, 'ask', 'Who is asked their standing order').junction(
				'planner',
				{ on: ($: any) => $.welcome.text },
				(p: any) =>
					p.when('seated', { truthy: true }, (s: any) =>
						s.each(
							'player',
							{ over: ($: any) => at($, 'standing.asked.list').main, max: 16 },
							(m: any) => {
								const prefix = 'standing.asked.planner.seated.player.item.'
								const item = ($: any) => at($, 'standing.asked.planner.seated.player.item')
								return jsonPart(
									textPart(textPart(m, w, prefix, 'lane', item, 'lane', 'Their lane'), w, prefix, 'line', item, 'text', 'Why they are asked'),
									w,
									prefix,
									'blocks',
									item,
									'blocks',
									'The standing order, asked',
								).outlet(
									'write',
									($: any) =>
										C.createMessage.v1({
											text: at($, `${prefix}line`).text,
											channel: at($, `${prefix}lane`).text,
											speaker: PLANNER as any,
											blocks: at($, `${prefix}blocks`).main,
										}),
									{ expose: { label: 'Ask their standing order' } },
								)
							},
						),
					),
			),
		),
	)

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
		.inlet('event', C.sessionEvent.v1(), {
			genre: dungeonCrawlerGenre,
			events: [sessionEvents.memberAdded],
		})
		.query('welcome', ($) => C.envoyGreeting.v1({ scope: $.event.sessionScope, params: slot.params() }))
	const built = askStandingOrders(openLanes(graph, w, ($) => $.event.session, ($) => $.event.sessionScope), w)
	return compile(
		built
			.preset('dungeon-crawler', { label: 'Dungeon Crawler', default: true }, (p: any) =>
				applyWiring(p.params('welcome', { envoy: DUNGEON_CRAWLER_PLANNER_KEY }), w),
			)
			.build(),
	)
}
