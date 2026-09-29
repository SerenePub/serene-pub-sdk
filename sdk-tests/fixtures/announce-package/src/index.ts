/**
 * A package whose entry still exports an `announce()` builder — the path kept
 * one release after `defineExtension()` became the one entry (the CLI warns).
 *
 * It is here as a regression pin rather than as an example: the build path a
 * bare `AnnouncementBuilder` takes must still write exactly the announcement
 * document and nothing else, byte for byte, after the unified path was added
 * beside it.
 */

import { announce, genre, sessionEvents, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

export const PACKAGE_NS = 'demo.announced'

const talkGenre = genre(`${PACKAGE_NS}:genre/talk`, {
	name: { en: 'Talk' },
	family: 'chat',
	events: { [sessionEvents.messageRespond]: { required: true } },
})

const createSession = spec(`${PACKAGE_NS}:spec/create-session`, { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), { genre: talkGenre, event: sessionEvents.sessionCreated })
	.build()

const respond = spec(`${PACKAGE_NS}:spec/respond`, { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), { genre: talkGenre, event: sessionEvents.messageRespond })
	.build()

export const talk = announce({
	ns: PACKAGE_NS,
	author: 'Serene Pub',
	title: 'Talk',
	summary: 'One genre, two pipelines, no code.',
})
	.genres({ talkGenre })
	.pipelines(createSession, respond)
	.presets({
		slug: 'talk',
		genre: talkGenre,
		label: 'Talk',
		bindings: [createSession, respond],
	})

export default talk
