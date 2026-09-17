/**
 * Core's shipped session presets (24 T6b) — declared here, seeded by SP.
 *
 * The announcement carries the full `preset()` declaration (validated
 * against the genre's event surface like any package's); `CORE_PRESET_SEEDS`
 * is the same fact in the shape SP's seed pass writes, with the idempotence
 * keys existing installs already carry. The two are one list mapped, so they
 * cannot disagree.
 */
import { preset, sessionEvents } from "@serene-pub/sdk";
import { adventureGenre, chatGenre, guideGenre } from "./genres.js";
import { CREATE_CHAT_SPEC_ID } from "./createChat.js";
import { CREATE_GUIDE_SPEC_ID, GUIDE_RESPOND_SPEC_ID } from "./guide.js";
import { RESPOND_SPEC_ID } from "./respond.js";
import { NARRATE_SPEC_ID } from "./narrate.js";
import { ADVENTURE_CREATE_SPEC_ID, ADVENTURE_RESPOND_SPEC_ID } from "./adventure.js";
import { ADVENTURE_ADVANCE_TIME_SPEC_ID, ADVENTURE_ANSWER_SPEC_ID, ADVENTURE_ASK_SPEC_ID, ADVENTURE_LOOK_SPEC_ID, ADVENTURE_REST_SPEC_ID } from "./adventureActions.js";
import { ANSWER_FORM_ADVENTURE_SPEC_ID, ANSWER_FORM_CHAT_SPEC_ID, ANSWER_FORM_GUIDE_SPEC_ID } from "./answerForm.js";
export const chatDefaultPreset = preset("chat-default", {
    genre: chatGenre,
    label: "Chat",
    description: "The standard roleplay chat, everything default.",
    bindings: {
        [sessionEvents.sessionCreated]: CREATE_CHAT_SPEC_ID,
        [sessionEvents.messageRespond]: RESPOND_SPEC_ID,
        // A form put to a participant the AI portrays is answered by the
        // genre's answer pipeline (R-15 *Forms*; U5d). Optional in the
        // surface; bound here so it works out of the box.
        [sessionEvents.formAddressed]: ANSWER_FORM_CHAT_SPEC_ID
    },
    // By identity (W-A): the declaration, not the spec — `narrate` is the
    // narrate spec's one action.
    actions: { include: [`${NARRATE_SPEC_ID}#narrate`] }
});
/**
 * The Adventure genre's shipped preset.
 *
 * ## It ships ENABLED
 *
 * The condition set for this lane was "enabled if the create path runs end to
 * end in tests", and it does: creating an Adventure session publishes the
 * create spec, seeds the cast's greetings and resolves the genre's seven
 * attribute slots, with no model call anywhere in it. The turn itself needs a
 * connection like every other turn does.
 *
 * ## What `defaults` says, and what it deliberately does not
 *
 * `genreFields` is the creation pre-fill for the three fields the genre
 * declares. `trustNarrator: false` is restated here rather than left to the
 * declaration's default because it is the one field with a safety meaning: a
 * preset is what a person starts from, and the answer to "does the model get to
 * change my character's health without asking" should be visible in the thing
 * that decided it.
 *
 * No `lorebookId`: the genre requires a lorebook and has no opinion about
 * which, and a preset naming one would name a row that exists on the machine it
 * was written on.
 */
export const adventureDefaultPreset = preset("adventure-default", {
    genre: adventureGenre,
    label: "Adventure",
    description: "A narrated world with a cast that acts on its own, stats and an inventory that change as you play, and a story clock that moves.",
    bindings: {
        [sessionEvents.sessionCreated]: ADVENTURE_CREATE_SPEC_ID,
        [sessionEvents.messageRespond]: ADVENTURE_RESPOND_SPEC_ID,
        [sessionEvents.formAddressed]: ANSWER_FORM_ADVENTURE_SPEC_ID
    },
    actions: {
        include: [
            `${ADVENTURE_LOOK_SPEC_ID}#look`,
            `${ADVENTURE_REST_SPEC_ID}#rest`,
            `${ADVENTURE_ADVANCE_TIME_SPEC_ID}#advance-time`,
            // The worked form (U5d): Ask puts a question to the cast, Answer
            // is what its options fire — by a click, or by the answer
            // pipeline committing an oracle's choice.
            `${ADVENTURE_ASK_SPEC_ID}#ask`,
            `${ADVENTURE_ANSWER_SPEC_ID}#answer`
        ]
    },
    defaults: {
        genreFields: {
            tone: "grounded",
            difficulty: "normal",
            trustNarrator: false
        }
    },
    enabled: true
});
/**
 * The guide genre's shipped preset (R-18; U5g). Enabled: the create path
 * runs end to end with no model call, and the genre's one envoy is seated
 * by its own `default: true` — the preset names nothing a session must
 * choose. No actions come along: a guide session is questions and answers.
 */
export const guideDefaultPreset = preset("guide-default", {
    genre: guideGenre,
    label: "Guide",
    description: "Ask Serene Pub's guide about the app itself — questions and answers grounded in the docs, no characters or story.",
    bindings: {
        [sessionEvents.sessionCreated]: CREATE_GUIDE_SPEC_ID,
        [sessionEvents.messageRespond]: GUIDE_RESPOND_SPEC_ID,
        [sessionEvents.formAddressed]: ANSWER_FORM_GUIDE_SPEC_ID
    },
    enabled: true
});
export const CORE_PRESETS = [
    chatDefaultPreset,
    adventureDefaultPreset,
    guideDefaultPreset
];
/** One declaration, in the shape SP's seed pass writes. */
const seedOf = (decl, seedKey, isDefault) => ({
    seedKey,
    name: decl.label,
    description: decl.description ?? "",
    genreId: decl.genre,
    bindings: Object.fromEntries(Object.entries(decl.bindings).map(([event, b]) => [
        event,
        { spec: b.spec }
    ])),
    ...(decl.defaults
        ? { defaults: decl.defaults }
        : {}),
    ...(decl.enabled === undefined ? {} : { enabled: decl.enabled }),
    isDefault,
    isImmutable: true
});
export const CORE_PRESET_SEEDS = [
    // ⚠ The seed keys never change spelling — existing installs match on them.
    seedOf(chatDefaultPreset, "core-chat-default", true),
    /**
     * ⚠ `isDefault: false`. "Default" here means *the preset a session with no
     * preset falls back to*, and there is exactly one of those on an instance.
     * Adventure is offered, not assumed.
     */
    seedOf(adventureDefaultPreset, "core-adventure-default", false),
    /** Offered, not assumed — the same footing as Adventure. */
    seedOf(guideDefaultPreset, "core-guide-default", false)
];
//# sourceMappingURL=presets.js.map