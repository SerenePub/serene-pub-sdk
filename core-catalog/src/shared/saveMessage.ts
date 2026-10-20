/**
 * 🚧 **Save message** — core's default answer to
 * `core:event/message-offered@1` (owner ruling 2026-10-15).
 *
 * A person's message is always saved through the pipeline: the host checks
 * the door (access, the genre, the persona, the length, the channel) and
 * dispatches the event; this spec writes the row — one `create-message@1`
 * with `role: 'user'`, speaking as the inlet's `speaker` (the person's
 * persona, their card-less player seat, or themselves) on the inlet's
 * channel, with the tray items as its attachments. Exactly the row the host
 * used to write itself, now receipted and swappable.
 *
 * ## No lock, every genre
 *
 * Like the built-in writes it declares no inlet lock and no genre: it serves
 * every genre. `preset()` binds it on `message-offered` whenever a preset
 * binds nothing of its own there, so the stored preset shows it. A genre that
 * wants to refuse a message (a sentence the person reads, their text kept),
 * rewrite it or route it binds its own spec on `message-offered` instead —
 * locked to its genre like any other.
 */
import { compile, spec, SAVE_MESSAGE_SPEC_ID } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/** @experimental */
export { SAVE_MESSAGE_SPEC_ID }

/** @experimental */
export const SAVE_MESSAGE_VERSION = '1.0.0'

/** Core's default save, as a document. @experimental */
export const saveMessageSpec = () =>
	compile(
		spec(SAVE_MESSAGE_SPEC_ID, {
			version: SAVE_MESSAGE_VERSION,
			taxonomy: { role: 'action' },
		})
			.inlet('input', C.messageOffered.v1())
			.outlet('save', ($) =>
				C.createMessage.v1({
					text: $.input.text,
					speaker: $.input.speaker,
					channel: $.input.channel,
					trayItems: $.input.trayItemIds,
					role: 'user',
				}),
			)
			.build(),
	)
