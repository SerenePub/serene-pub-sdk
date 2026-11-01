# Coming from SillyTavern extensions

If you have written a SillyTavern extension, you already know most of what a Serene Pub plugin
does. The names differ, and one thing you are used to is deliberately missing: the page. This
guide maps the extension API you know onto the SDK, says where each habit lives now, and tells you
up front which kinds of extension port with light edits, which need their interface rebuilt, and
which are a rewrite. It was written while porting a large, interface-heavy extension, so the
hard parts are the ones that actually hurt.

Read [What a plugin can do](extending.md) first if you have not; this page assumes its words.

## The one difference that decides everything

A SillyTavern extension is a script loaded into SillyTavern's own page. It can read and change
anything there: append a panel to a drawer, patch the send form, read `#chat`, call `fetch`, call
the model whenever it likes. That is also why installing one is an act of trust.

A Serene Pub plugin never runs in the app's page. Its code runs in a sandbox on the server, as
**handlers** a pipeline calls; its interface is a **widget** or a **frame** in an iframe that
draws what the session sends it and presses actions. There is no DOM to patch, no page-wide
jQuery, no direct model call, and no table read. What an extension did by reaching into the page,
a plugin declares, and the host does it.

Everything below follows from that. The data and prompt half of the extension API has a close
counterpart. The interface half does not, and is rebuilt as a frame.

## Name for name

| In SillyTavern | In Serene Pub | Notes |
| --- | --- | --- |
| `manifest.json` + `index.js` loaded into the page | one `defineExtension({ … })` call, packaged with the CLI | [Your first plugin](your-first-plugin.md). The package carries compiled documents, never your builder code. |
| `getContext().chat` | the session's history, on an input port of your step | Wired from one of core's read steps upstream. Your code never queries it. |
| `getContext().characters`, the current character | the **cast** | [Vocabulary](vocabulary.md#what-a-session-holds) |
| `power_user.persona…`, the user persona | the **persona** section a widget is granted | Personas are characters a person plays. |
| World Info, `getContext().worldInfo…` | the **lorebook**: entries, places, cast, annex | [Writing lore from a pipeline](writing-lore-from-a-pipeline.md), [The lorebook annex](storage.md#the-lorebook-annex) |
| `eventSource.on(event_types.MESSAGE_RECEIVED, …)` and friends | an **event listener** on a core event | [Events](events.md). The table below maps the event names. |
| `setExtensionPrompt(key, text, position, depth, role)` | a step in the reply pipeline that places your text | [Where values come from](where-values-come-from.md). See "Injecting a prompt" below. |
| `generateQuietPrompt(…)`, `generateRaw(…)` | a `generate-text` step in a pipeline of your own | A plugin never calls a model from code; its pipeline places the call and an admin picks the model. |
| `extension_settings[key]` + `saveSettingsDebounced()` | **settings** (admin or per person) and **storage** (your files) | [Storage](storage.md). Settings are declared, with types and defaults. |
| `chat_metadata`, per-chat extension data | **annex fields** in the session annex | [A value a widget saves](storage.md#a-value-a-widget-saves-annex-fields) |
| `registerSlashCommand(…)` | an **action** with a `slash` name | [Actions](extending.md#actions) |
| a button appended to the composer or a message | an **action** in the `composer` or `message` venue | Same section. The host draws it. |
| a settings drawer built from HTML | **settings** declared on the plugin | The host draws the form. |
| a panel or popup built from HTML | a **widget** (small, data in, actions out) or a **frame** (a whole HTML document) | [Widgets](widgets.md), [Frames](frames.md) |
| `fetch(…)` to any server | `ctx.fetch` from an **oracle** step, to hosts you declared | [Plugin permissions](plugin-permissions.md). Listeners and tasks have no network. |
| extension assets served from the extension folder | files in your package, served to your frame under `assetsBase` | [Frames](frames.md#content-in-the-package-assets). Pictures, sound and fonts, with the right MIME types. |
| `i18n` JSON files and `t(…)` | `lang/<locale>.json` in the package and `ctx.t(…)` | Same shape: English text as the key, `{0}` placeholders. |
| a timer or `setInterval` | the hourly `schedule-tick` event, or a **routine** on a story cadence | [Listeners](extending.md#event-listeners-and-lifecycle-callbacks), [Genres, presets and routines](genres-presets-and-routines.md) |
| the extension's own "game mode" that takes over the chat | a **genre** | [Genres](extending.md#genres). A genre brings its pipelines, its defaults and, if it wants one, its own session view. |

### Event names

The events you listened to in SillyTavern have these core counterparts. A listener is declared in
`handlers`; it is told what happened and may use your storage, nothing more.

| SillyTavern `event_types` | Core event | What it carries |
| --- | --- | --- |
| `MESSAGE_SENT`, `MESSAGE_RECEIVED` | `core:event/message-created@1` | session, message, speaker |
| `MESSAGE_EDITED` | `core:event/message-edited@1` | session, message |
| `MESSAGE_DELETED` | `core:event/message-deleted@1` | session, message |
| `MESSAGE_SWIPED` | `core:event/message-swiped@1` | session, message |
| `GENERATION_STARTED` | `core:event/message-respond@1` | the moment a reply is asked for; the reply pipeline itself runs here |
| `GENERATION_ENDED` | `core:event/message-completed@1` | session, message |
| `CHAT_CHANGED` | `core:event/session-created@1`, `core:event/session-updated@1` | there is no "switch chat" on the server; a session is a thing that exists, not a page you are on |
| `CHARACTER_EDITED`, group member changes | `core:event/cast-changed@1` | session, cast member |
| a turn in a group chat | `core:event/turn-ended@1`, `core:event/round-ended@1` | session, message, speaker |
| none | `core:event/scene-opened@1`, `scene-closed@1`, `story-clock-moved@1` | scenes and story time are core's; an extension that kept its own clock can stop |

The full list, with what each one carries, is in the SDK reference under Events.

## Injecting a prompt

The most common extension trick is `setExtensionPrompt`: push a block of text into the prompt at
a depth, as a system or user line. Serene Pub has no injection slot, because there is no single
prompt being assembled behind your back. The reply pipeline is a graph you can see, and the
prompt is a template filled from variables.

So there are two ways to say "add this to what the model is told", and which one you want depends
on who should be able to change it:

- **Put it in the template.** If the text is prose a person might tune, make it part of the
  genre's prompt. The session owner edits it in the session's settings, the way they would edit
  an author's note, and your code is not involved.
- **Compute it in a step.** If the text depends on state (a scoreboard, who is present, the
  weather), add a **task** to the pipeline that computes the block, and place it in the template as
  a variable. Your task is pure: data in on its ports, a string out. The host shows the person
  where the block went, and the layout accounting counts its tokens.

What you cannot do is inject into a pipeline you did not place a step in. A plugin that wants to
add a block to the Chat genre's reply ships a **preset** that registers a pipeline of its own, or
a genre of its own. That is deliberate: a person can always see which pipeline answered and what
each step added.

## Calling the model

`generateQuietPrompt` ran a side question (a summary, a judgement, a verdict) and gave you the
text. The counterpart is a pipeline of your own with a `generate-text` step, started by an event
or an action, whose answer flows into the next step. Three consequences:

- An admin picks which connection and model answers, per step kind. You do not name a model.
- The call is visible in the run record, with its prompt and its cost, like every other call.
- If you want structured output, ask for it: the generate step can be told the shape, and the
  pipeline refuses an answer that does not match rather than letting you parse prose.

An extension that chained several quiet prompts (ask, then judge the answer, then maybe ask
again) becomes several steps in one graph, which is both easier to read and retractable: Back
undoes the whole run, not just the last message.

## Keeping state

SillyTavern gave you two places: `extension_settings` for everything, and `chat_metadata` for
per-chat data, both serialised with the page. Serene Pub splits by who may see it:

- **Settings** are what an admin, or each person, configures. Declare them with types and
  defaults; the host draws the form and validates the input.
- **Storage** is your plugin's own files: hidden state only your code reads. You ask for a quota
  in the declaration and an admin grants it.
- **Annex fields** are small values kept in the session, visible to the people in it, which a
  widget may save and read back. This is where `chat_metadata` goes.
- **The lorebook annex** is the same idea on a lorebook: what should survive this session into
  the next one in the same world.

A save blob that mixed all four is the biggest single piece of work in a port. Decide early which
value belongs where, because the host's Back and Forward only know about the values it holds.
[Storage](storage.md) has the rules and the quotas.

## Rebuilding the interface

This is the part that does not port. An extension's HTML, appended into SillyTavern's drawers
and panels, has no place to go: the app's interface is not yours to patch, and your plugin never
sees it. You have two vehicles:

- **A widget** for anything small: a status line, a scoreboard, a few buttons. It is a component
  the host places in a session panel. It is given exactly the sections it was granted (the cast,
  the persona, the lorebook, your annex fields) and it presses actions. No network, no storage.
- **A frame** for a whole interface: a map, a phone, a visual novel screen, a charting library.
  It is an HTML document of yours in a sandboxed iframe. It receives the same sections as a
  widget plus your package's assets, talks to the host through a small message port (`init`,
  `notify`, `file-pick`, `file-save`, `save-state`, `invoke`), and may ask to open full screen.
  A genre may declare a frame as the whole session view.

What you keep: your CSS, your rendering code, your screens. The frame is a page you own, and a
careful port carries the original stylesheet across unchanged. What you drop: every line that
found something in the host's DOM. What you add: a thin layer that turns messages from the host
into state for your screens, and actions and requests back.

Plan the interface port by listing every place the extension touched SillyTavern's page, then
sorting each into "a widget", "part of the frame", or "the host already does this". The third pile
is larger than you expect: turn controls, swipes, the composer, the message menu, character
editing and lore editing are all drawn by the app and reached through actions and requests.

## Which extensions port, and how

Sort yours by what it touches, not by how big it is.

**Shim and go: prompt and data extensions.** Summaries, memory, regex rewrites, a timeline, a
tracker that writes a block into the prompt. The logic ports nearly unchanged into a task or a
listener; the injection becomes a template variable; the settings become a declaration. Before
you start, check the app: several of these are built in (summaries to a lorebook, stats and
states, scenes and history), and what you want may be a genre preset rather than a plugin.

**Port the logic, rebuild the panel: tools with an interface.** A dice roller, a card game, a
relationship tracker with a panel. The logic goes into handlers, the panel into a widget, the
per-chat data into annex fields. A day or two of work, most of it the panel.

**Rewrite the shell, port the engine: extensions that take over the chat.** Games, simulations,
anything with its own screens, world files and save format. The engine ports file for file. The
save format is split into attributes, annex and storage. The screens become one frame that the
genre declares as the session view. The glue that faked a host inside SillyTavern (its own clock,
its own presence tables, its own scene log) is deleted, because core has those. Budget most of
the time for the frame, and keep the original source tree beside the port so upstream changes
can be diffed across.

## What you cannot bring

- **Anything that patches the app.** A plugin cannot restyle Serene Pub, add a menu to its header
  or change how messages are rendered. Message style packs are a separate, CSS-only mechanism.
- **A free-running script.** Nothing runs between events. There is no `setInterval`; there is
  the hourly tick and the story's cadences.
- **Direct model access.** No API keys in your code, no choice of model, no call outside a
  pipeline.
- **Reading other plugins' data, or the app's tables.** Your inputs are your ports and your
  grants.
- **Creating characters or lorebooks from code.** A plugin can ship lore as an import file and
  write entries from a pipeline; it cannot create a book or a card itself. This is a known gap
  and is on the list for the SDK's first stable release.

## A worked sketch

A SillyTavern extension that kept a mood per character, injected "Alice is tired" at depth 2,
and showed a small mood panel becomes:

<!-- prelude:
import type { SessionEventDecl } from '@serene-pub/sdk'
declare const moodChanged: SessionEventDecl<{ who: string; mood: string }>
-->
```ts
import { eventListener, ok } from '@serene-pub/sdk'

export const handlers = [
	// The per-character data, in your own storage; nothing on the page.
	eventListener(moodChanged, async (e, ctx) => {
		const { who, mood } = e.payload as { who: string; mood: string }
		await ctx.storage.files.write(`moods/${who}.txt`, new TextEncoder().encode(mood))
		return ok({})
	}),
]
```

The "Alice is tired" line is a task that reads the cast on an input port and returns the block,
placed in the reply template as a variable where the author's note used to be. The panel is a
widget granted the cast and one annex field, pressing a `set-mood` action that records
`moodChanged`. The settings drawer is a `settings` declaration with the one toggle the extension
had. Nothing in it names a model, a DOM element, or a timer.

## Where to go next

- [Your first plugin](your-first-plugin.md), end to end, with the CLI.
- [Frames](frames.md) when your port has screens of its own.
- [Where values come from](where-values-come-from.md) for how a prompt is assembled, which
  replaces everything you knew about injection depth.
- The user-facing [Coming from SillyTavern](/docs/coming-from-sillytavern) page, for the
  habits of the people who will install your plugin.
