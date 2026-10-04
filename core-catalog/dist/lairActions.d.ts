/**
 * The **Lair** genre's actions — what the dungeon's master does between turns
 * (plans/genres-and-showcase-plugins §3, "Room building").
 *
 * `session-action` is an OPEN event, so each of these is its own small
 * pipeline contributing its own button, and removing one from a preset takes
 * the button with it and breaks nothing. Three shapes:
 *
 *  - **Build room**, **Answer the door** and **File as a room** write a
 *    *lorebook entry*. They are the three actions here that reach outside the
 *    story, so they are the three declared `effects: 'world'` — owner-only,
 *    and never named by a block. *File as a room* lives on a message's ⋮ (the
 *    row it files is its subject, R11); the other two live in the composer
 *    and are nameable only by a message block **addressed to the owner**
 *    (R-15 *The line*; L1, ruled 2026-09-17). The knock's block is exactly
 *    that block, which is what makes its options real writes rather than
 *    narration.
 *  - **Whisper** and **Nudge** write *state* and no message: a standing
 *    instruction for the delvers the master picks (R10), and one for the
 *    Castellan. Neither calls a model. Pressing Nudge
 *    produces nothing visible in the log, which looks like a bug the first
 *    time you see it and is the same thing Adventure's Rest does.
 *  - **Trigger trap** and **Reveal** write a *message* and change nothing:
 *    the Castellan's turns with a fixed instruction, Adventure's Look with a
 *    different sentence in its prompt — one streamed row under the
 *    Castellan's name (lair pass B17, owner D7a; R8).
 *
 * ## Why the two steering actions write slots rather than messages
 *
 * A directive that produces no message still has to reach the next turn, and a
 * session has exactly three places a fact can live: the transcript, the
 * lorebook and the state. A nudge is not a line anybody said and not a fact
 * about the world, so it is state — `core:slot/direction@1` for the Castellan,
 * `core:slot/whisper@1` per delver — and the planner and the voices already
 * take `state` on a port, which makes the note a control something *reads*
 * rather than a second store nothing walks. (The planner reads the direction;
 * a whisper is heard by its holder's voice alone — earshot, R1.)
 *
 * ⚠ **The channel route was the other candidate and does not work.** A hidden
 * message on a `whispers` channel is one node to write and unreadable
 * afterwards: `core:query/session-history@1` reads exactly one channel, and no
 * core node merges two transcripts into the one `messages` port `assemble`
 * takes. It would have been a button wired to nothing.
 */
/** @internal */
export declare const LAIR_BUILD_ROOM_SPEC_ID = "core:spec/lair-build-room";
/** @internal */
export declare const LAIR_BUILD_ROOM_VERSION = "1.0.0";
/**
 * The layout a drafted room's body takes — its `Exits:` line among it — and
 * why that line is still prose beside the graph.
 *
 * **The ways between rooms are relationships now** (places plan, 2026-09-29):
 * one `narrative_relationships` row per way, read both ways when it has a
 * reverse wording, drawn on the Places lens or in a place's own Links, and
 * written by a pipeline through `core:outlet/link-lore-entries@1`. The Lair's
 * rooms listing asks for them (`withLinks`), so `{{locationEntry}}` says a
 * room's ways out under its body as "From here:" — that, not this line, is
 * what the planner reads the ways on from. *Answer the door* links the room it
 * writes to the room the party stand in (B6).
 *
 * ⚠ **The drafted `Exits:` line stays** (plan §11; how the map should grow is
 * the owner's open Q4). A draft names ways out to rooms that may not exist
 * yet, and nothing in the bound catalogue turns a line of prose into a list
 * of names; parsing it at write time, with stub rooms for the names nothing
 * answers, would change what a knock means. So the line is the room's own
 * words — a reader still reads it, and an older room has only it — and the
 * master turns it into links by hand, or with the place editor's *Read links
 * from the Exits line* (B7). It stays a fixed line so a parser can take it
 * apart.
 * @internal
 */
export declare const LAIR_ROOM_CONTENT_SHAPE: string;
/**
 * **Build room**: the master writes a room into the dungeon.
 *
 * The collected text (R3) is the room's **name** — the one thing a person always
 * knows when they press this — and the model writes the body against the lore,
 * the party's position and the fixed layout above. The name reaches the draft
 * as `{{turnDirection}}`, and every room the dungeon already has as
 * `{{knownLocations}}` (the rooms listing, plan A28) — the prompt's "name only
 * rooms this dungeon already has" with the rooms in front of it. The world
 * lore it reads carries no private entries. The write then parks at the
 * review gate: `core:outlet/create-lore-entry@1` declares
 * `review: { fields: ['name', 'content'] }`, and the preset below turns the
 * gate ON — without that line `resolvePosition` defaults an undeclared position
 * to `off` and this docblock's promise would be false, which it was until
 * 2026-09-17. The gate IS the Build room form, with the name and the whole body
 * editable before anything lands.
 *
 * **The entry is a location** (L3, contracts batch 2, 2026-09-17): the preset
 * sets `entryType: 'core:entry/location'`, so a room files as a place rather
 * than as world lore whose content happens to be laid out, and "which rows are
 * the map" becomes a question a reader can ask. It is written with no links:
 * a room built ahead of the party stands nowhere yet, and its drafted `Exits:`
 * line is prose the master links by hand — see `LAIR_ROOM_CONTENT_SHAPE`.
 *
 * ⚠ **`effects: 'world'`** (R-15 *The line*): the result is lorebook data, so
 * this action is the owner's, lives in the composer, and no message block may
 * name it. That last rule is why the knock's form cannot save a room itself.
 * @internal
 */
export declare const lairBuildRoomSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const LAIR_ROOM_ANSWER_SPEC_ID = "core:spec/lair-room-answer";
/** @internal */
export declare const LAIR_ROOM_ANSWER_VERSION = "1.0.0";
/**
 * **What the knock's option fires** — the other half of the respond spec's
 * `door.knock` branch (R-15 *Forms*), and the composer's *Answer the door*
 * (`/room`) while a knock is open.
 *
 * **The knock asks for a description** (lair re-plan R9, owner rulings 2 + 6,
 * 2026-09-28). The action collects optional text (R3's collect modal, or S2's
 * slash argument — `/room <text>`), and a junction on it decides:
 *
 *  - **typed** — the text IS the room: a location entry named after the door
 *    the party knocked at, its content **the typed text, verbatim**, and **no
 *    review gate**. It is the master's own words; a gate would ask them to
 *    approve what they just typed.
 *  - **drafted** — nothing typed: the Castellan drafts the room in the
 *    dungeon's layout (`LAIR_ROOM_CONTENT_SHAPE`, the form *Build room* drafts
 *    into, the `lair-knock-build` prompt), and the master edits it at
 *    `create-lore-entry`'s **review gate** before it lands.
 *
 * Retired with the two-option knock: *I will build it* and *Let the Castellan
 * improvise it* (`KNOCK_OPTIONS`), and the improvise branch's narration
 * (its `lair-improvise` prompt row). An empty answer drafts and gates exactly
 * as either used to.
 *
 * **A rejected draft re-opens the knock** (owner F5; R9). Not this spec's
 * rule: a core one in the app's review gate — an answer rejected at review
 * that wrote nothing is no answer, so the form is not marked answered, its
 * row is re-announced and its open-form notification raised again. The room
 * is still undescribed, the story still waits, and *Describe <room>…* and
 * `/room` are offered again.
 *
 * Writing a lore entry is `effects: 'world'`, and the rule that used to stop a
 * block naming one is the effects line's one exception (L1, ruled 2026-09-17):
 * `worldBlockFunctions` refuses any block naming a world action **unless the
 * block is addressed to the owner**, and the knock's block is addressed to
 * `owner` precisely because the dungeon's master is the only person it could
 * sensibly be put to. So this action is declared `world` and lives in the
 * `composer` venue — the `form` venue stays fiction-only, because a venue is
 * declared and an addressee is decided at run time (see `sdk/src/actions.ts`).
 *
 * **The room's name travels on the block** (lair pass B12, 2026-09-27). The
 * knock's `choices` block carries the checked name as its `referent`,
 * `read-answer@1` hands it back, and it is the entry's `name`. A press that
 * carries no form never gets that far: `answer` halts (*nothing to answer*),
 * which is why the action is present only while a knock is open (W-GATE D3,
 * `presentWhen`), and a composer press while it is open is addressed to that
 * knock by the host.
 *
 * **The new room joins the room the party stand in** (places plan B6,
 * 2026-09-29). The party knocked from somewhere: the world's `location` stat,
 * else the room the knock's planner named (the block's `vantage`, plan A27).
 * `here` resolves it against the rooms the dungeon lists — the Lair's name
 * rule, `undescribed-name@1` reading the name at `world.location` inside the
 * session's state (a location set to a place entry is that entry, by id) —
 * and, once the room has landed, the `link` junction writes ONE relationship
 * from the new room to that one, `leads to` both ways
 * (`core:outlet/link-lore-entries@1`). The next turn's planner reads it under
 * the room as "From here:".
 *
 * ⚠ **Invariant: the door never fails because the party's location names no
 * room** (plan §3 #11). The location is usually words, and `create-lore-entry`'s
 * own `links` refuses a name nothing answers to inside the entry's transaction
 * — which would fail the room with it. So the link is its own write, after the
 * room's, in a junction that fires only when `here` found a room: otherwise
 * the room is saved unlinked. A rejected draft ends the run before either. The
 * link is not gated (the master judged the room; the way back to where the
 * party stand is not a second question) and the outlet is idempotent, so a
 * repeat stacks nothing.
 *
 * **Then the story goes on.** Once the room lands, the master's own line —
 * *The party go on into The Drowned Hall* — is written under their name, the
 * way a send is: the turn order prepares the Castellan's turn, auto-advance
 * fires it as it would after any send, and the planner, which now lists the
 * room, walks the party in. A rejected draft ends the run at the gate, so
 * nothing is said and the knock is open again.
 * @internal
 */
export declare const lairRoomAnswerSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const LAIR_FILE_ROOM_SPEC_ID = "core:spec/lair-file-room";
/** @internal */
export declare const LAIR_FILE_ROOM_VERSION = "1.0.0";
/**
 * **File as a room** — a room described in a message reaches the lorebook
 * (lair re-plan R11, 2026-09-28; owner ruling 1: the Sanctum is where the map
 * is laid out ahead of time, and a planned room reaches the lorebook only
 * through a review-gated write).
 *
 * The rooms worth filing are written in prose first: the master narrates the
 * party into one on `main` (the person is the narrator, F2), plans one with the
 * Castellan in the Sanctum, or the Castellan narrates one when it is fired. So
 * this lives on the **message** — a row's ⋮ — and acts on that row: its text is
 * read by id (`session-history@1`'s `messageId`, the inlet's), never sent by
 * the client.
 *
 * **Whose rows.** The person's and the Castellan's — any row that is not a
 * character's line (`item.characterLine equals false`, the grammar's one
 * condition: *the person's or the Castellan's* is exactly *not a delver's*). A
 * delver naming a door is not the dungeon's plan, which is the same rule the
 * room check applies to prose (`undescribed-name@1`, R7). Greyed there with
 * the sentence, and refused at the door with the same one.
 *
 * **The name is collected** (R3's collect modal): required, because it is what
 * the person can find the room by again (*Build room*'s rule), because a
 * message may describe more than one room and the name says which, and
 * because it is what the duplicate check runs on — before any model call, so
 * a room already in the book costs nothing. It stays editable at the review
 * gate, where the draft is.
 *
 * **Then, R9's drafted path.** A room already in the book by the SDK's name
 * rule (`undescribed-name@1` over the location entries, then the whole book;
 * no prose read — the row itself is prose) is not filed twice: the Castellan
 * says so on the Sanctum, and nothing is written. Otherwise the Castellan
 * drafts the entry from that one row in *Build room*'s layout
 * (`LAIR_ROOM_CONTENT_SHAPE`, `Exits:` when the message names them) and
 * `create-lore-entry`'s **review gate** holds it — even from the person's own
 * row, because the row may say more than the room. Approved, it lands as a
 * **location**; rejected, nothing is written.
 *
 * ⚠ **`effects: 'world'` in the `message` venue.** A row's ⋮ is the owner's
 * side of the effects line since this action (`WORLD_ACTION_VENUES`, R11):
 * the owner's own press, the row its subject. `act` stays `owner`; no block
 * names it; no answer pipeline presses it.
 * @internal
 */
export declare const lairFileRoomSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const LAIR_NUDGE_SPEC_ID = "core:spec/lair-nudge";
/** @internal */
export declare const LAIR_NUDGE_VERSION = "1.0.0";
/**
 * **Nudge**: a directive to the Castellan's planner that produces no message.
 *
 * The shortest pipeline in the catalog that does anything: no model call, no
 * retrieval, no transcript. The collected text (R3) becomes
 * `core:slot/direction@1` on the world, the planner takes `state` on its own
 * port, and the note is in the next turn's prompt.
 *
 * ⚠ **`apply`, not `propose`** — the one place in this genre where a state
 * write skips the review the state-keeper's changes get. The argument for
 * `propose` is that a *model* is not authoritative about the fiction
 * (`set-state`'s own header). Here the writer is the person who owns the
 * session, typing into their own composer, and asking them to accept their own
 * instruction would be a dialog asking "did you mean what you just typed".
 * @internal
 */
export declare const lairNudgeSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const LAIR_WHISPER_SPEC_ID = "core:spec/lair-whisper";
/** @internal */
export declare const LAIR_WHISPER_VERSION = "1.0.0";
/**
 * **Whisper**: a private instruction to the delvers the master picks, which
 * writes no message (lair re-plan R10, owner ruling 5, 2026-09-28).
 *
 * The press collects **who hears it** (`collects.recipients`, the session's
 * enabled cast, validated by the host) and **what it says**
 * (`collects.text`), and the run writes that line on
 * `core:slot/whisper@1` of each recipient — `resolve-state-changes@1`'s
 * `owners` port makes the one change once per recipient. **Pure:** no model
 * call. The model step that read a name off the typed line ("Verity: hold
 * the line") and its "Lair whisper" prompt row are retired: the modal asks
 * who, so nothing has to guess.
 *
 * **Heard by the recipients alone** (earshot, lair pass R1): the slot
 * declares `earshot: 'holder'`, so each recipient's own voice reads it and no
 * other prompt does — not another delver's, and none of the Castellan's
 * (planner, keeper, narration, Sanctum talk). A whispered delver acts on it
 * when they next speak; **Pick who speaks** gives them the floor now.
 *
 * ⚠ One standing note per delver, not a queue: a slot holds one value, so a
 * new whisper REPLACES a recipient's old one, and a delver it does not name
 * keeps theirs. The modal shows each delver's current whisper
 * (`recipients.overwrites`), so the overwrite is visible before it happens.
 * @internal
 */
export declare const lairWhisperSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const LAIR_TRAP_SPEC_ID = "core:spec/lair-trap";
/** @internal */
export declare const LAIR_TRAP_VERSION = "1.0.0";
/** Spring something the party walked into. The Castellan tells them what it cost. @internal */
export declare const lairTrapSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const LAIR_REVEAL_SPEC_ID = "core:spec/lair-reveal";
/** @internal */
export declare const LAIR_REVEAL_VERSION = "1.0.0";
/** Show the party something that was already there. @internal */
export declare const lairRevealSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=lairActions.d.ts.map