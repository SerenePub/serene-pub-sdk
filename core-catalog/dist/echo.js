/**
 * A deliberately minimal core action spec — the human-in-the-middle test
 * harness (and the shape the image-generation Provider node will reuse).
 *
 * Structurally it is the smallest possible person-invoked action: no queries,
 * no LLM provider — just the standard-chat input feeding straight into a write
 * consumer. Its whole point is the REVIEW GATE: the `save` node writes a session
 * message (`effects: 'write'`, so it is gate-eligible), and the shipped default
 * preset turns its review ON, so a run PARKS there — the executor infers a form
 * from the node's payload (`{ text }`) and the review modal asks the person to
 * type the text before it is written. Approve-with-edit folds their entry back
 * into the payload and the message is posted.
 *
 * When image generation lands, `save` is swapped for the image Provider node and
 * this same gate becomes the "SD prompt" modal — the trigger, the pause, and the
 * payload round-trip are proven here first with zero backend.
 */
import { compile, spec, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { chatGenre } from './genres.js';
export const ECHO_SPEC_ID = 'core:spec/echo';
export const ECHO_VERSION = '1.0.0';
export const echoSpec = () => compile(spec(ECHO_SPEC_ID, {
    version: ECHO_VERSION,
    /** A person-invoked action on chats (23 §2), same as narrate. */
    taxonomy: {
        zone: 'session',
        role: 'action',
        genre: chatGenre.id,
    },
    /**
     * The contributed trigger (19 §4): offers the `echo` function on
     * standard-mode sessions as a button. Same namespace as the genre
     * owner, so it lands as a companion — present by default — and any
     * `kind: 'button'` trigger renders itself in the composer's extra
     * controls with no client code (the generic `fireTrigger` path).
     */
    contributes: {
        triggers: [
            {
                genre: chatGenre.id,
                function: 'echo',
                kind: 'button',
                icon: 'pencil',
                i18n: { en: 'Echo' },
            },
        ],
    },
})
    // Manually triggered — a person presses the button; no message drives it.
    .on('core:event/ui-action@1')
    /** The usage lock (24 §4): a person-invoked action on Chat sessions. */
    .input('input', C.userMessage.v1(), {
    genre: chatGenre,
    event: sessionEvents.sessionAction,
})
    // The one node: write the (reviewed) text as a session message.
    .consume('save', ($) => C.createMessage.v1({ text: $.input.text }))
    // Ship review ON as the default, so the run always parks at `save`
    // and the person is asked to type the text (the whole demo).
    .preset('review-on', { label: 'Review on', default: true }, (p) => p.settings('save', { review: 'on' }))
    .build());
//# sourceMappingURL=echo.js.map