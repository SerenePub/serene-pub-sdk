# `@serene-pub/conformance`

Thirty-three executable requirements a Serene Pub executor must satisfy. Run by SP Core against
its own implementation, and by any alternate host.

**Plugin authors need one part of it:** the six package cases (C28–C33, `conformPackage`) over
what `npm run package` built — see [A package's own artifact](#a-packages-own-artifact-c30c33).
The rest answer "does this host obey the laws?" — for "does my hook behave, and did my change
alter what gets sent?", use `@serene-pub/sdk/testing`.

Each requirement names what breaks when it fails, in user-visible terms, so a red result is
a bug report rather than a number.

## The laws of 09-AMENDMENTS-B (C16–C20)

Added 2026-09-17 (plans/30 U7) for the five laws the amendments appended to the Fixed
Ledger — F37–F41, renumbered from the amendments' F35–F39 because 01 already held F35 and
F36.

| Id  | Law | Holds that                                                                                                                                                                                                            | What breaks when it fails                                                                                          |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| C16 | F37 | **One live row.** (a) `validate()` refuses two `create-message` placeholders in one document (`fx.twoWrites()`) under F7, with a fix — that refusal is the law at publish; (b) a run of `fx.chatTurn()`, whose write opens the live row (`generating: true`), names that row to the host, once, and the world takes exactly one write; (c) the dry run of the same tells the host `dry`, names no real row (`undefined` or `dry:…`) and commits nothing. | The composer streams into the wrong row, two placeholders appear, Stop cannot tell which row to finalise.          |
| C17 | F38 | **A preview writes nothing.** `dry: true` on `fx.chatTurn()`: every outlet runs, every recorded write is the synthetic `dry:<nodeKey>` id, the event a write causes is still recorded and flagged `dry` (never dropped, never dispatched), the host is told `dry`, and the world took zero writes. | A token estimate leaves a placeholder row behind every keystroke; a debug preview bills for rows nobody asked for. |
| C18 | F39 | **Settings never travel.** (a) `validate()` refuses a data edge from a node's `settings` address (`settings`, `settings.review`, …) and a hand-written config reference naming it (`{ __ref: 'slot', slot: 'settings', ofNode }`) under `F39` with a fix. (b) The write outlet's **declared** switch `settings.review` is set `on` through `world.overrides`, with a reviewer that approves: **positive control first** — the reviewer was asked for the owner at `on` (the owner received its own switch; a host ignoring overrides fails here) — then no other hook's ctx or input carries that switch at its value, and a sentinel planted beside it on the same slot reaches nobody; on the sound document and on each refused one run **unvalidated** (the executor resolves the reference to nothing and notes why on the row). The switch and the sentinel are the check; a ctx key that merely sounds like an accessor is a hint in the failure text, never a finding. | A plugin node silently depends on another node's review toggle; configs stop being independent.                   |
| C19 | F40 | **Every enabled action is reachable.** The host's own listing — `HostUnderTest.listActions(doc, channel)` — of `fx.actions()` (a quick one, a plain one, one on a named channel, one on a core verb's function): each action is listed exactly once in its venue, in the primary set iff `quick`, on its channel and not on `main` when declared for another, and every composer entry carries the slash name the host calls it by — in the grammar its spec may claim, the declared name when there is one, the derived name otherwise. Compared by `key` + `specId`, never by object. A host without the seam fails C19 by name. | An installed action is invisible with no way to reach it.                                                          |
| C20 | F41 | **The effects line.** A `world` action in a venue off the owner's side (a `widget`; a message's own ⋮ is the owner's since 2026-09-28, lair re-plan R11), and one whose `act` audience names `participant`, are each refused by `validate()` under `F41` — the label, not a word in the sentence — with a fix. | A character grants another character permission by construction.                                                  |

Three seams a host supplies, and what happens without each:

- **`Fixtures.writesSeen()`** — C16 and C17's write probe watches `RunOptions.host.commit`.
  A host whose writes bypass that seam supplies a row count instead, and the checks read it
  before and after each run. The probe is read first: a probe that saw the commit is never
  shadowed by a row count it kept from moving (a host routing `ctx.commit` through
  `RunOptions.host` hands the probe the write the database never gets). With neither
  showing a write, C16 and C17 fail naming the gap rather than passing on a zero they could
  not have observed — "the fixtures supply no writesSeen()" only when there is none.
- **`HostUnderTest.listActions(doc, channel)`** — the host's own venue projection, which
  C19 judges entry by entry. The SDK's host builds it with `placeActions` over
  `actionsOf(doc)`, each entry decorated with `slashNameOf`; core builds it from
  `listSessionActions` (its `specSlug` is the entry's `specId`). Without it C19 fails by
  name: the law is about what the host lists, and a listing the kit computed on the host's
  behalf would pass any host.
- **A `run` that skips publish-time validation** — C18(b) runs the refused F39 documents
  on purpose. A host whose `run` refuses them (its error carries F39/F7 findings, or
  `assertValid`'s `[F39]` lines) is **not failed**: that half is recorded on the result as
  `skipped`, with the reason, and `renderConformance` prints it as `~ not judged`. Read
  those before calling a host conformant.

Two things the kit does **not** reach, and why:

- **The hook ctx per kind (plans/29 R-3)** was out of reach until C25: the kit's
  `HostUnderTest` had no plugin surface to hand a hook. It now asks for one —
  `hookCtxKeys(kind)`, the keys a handler the host dispatched found on its `ctx` — and the
  host's own sandbox tests (in core, `SesWorkerSandbox.test.ts`, `QuickJsSandbox.test.ts`
  and the install-time conformance probe) remain the proof for the kinds it cannot
  dispatch; C25 names those rather than passing on them.

- **C20's third half** — a message block naming a `world` action — was likewise out of
  reach, because a spec's `blocks` are a node's output and `validate()` does not inspect a
  literal. C23 judges it where it is judged in the product: at the write, through
  `worldBlockFunctions`, the same function the host runs.

## The laws the showcase lanes hit (C21–C26)

Added 2026-09-17 (plans/genres §14 D-7) for the six laws Battleship, Twenty Questions, Lair
and Whodunit each designed around. Every one of them already held in code; none was on a
page an author reads, which is the failure this kit exists to prevent.

| Id  | Law | Holds that | What breaks when it fails |
| --- | --- | ---------- | ------------------------- |
| C21 | F7, 01 §4 | **One live row per run, never inside a repeat, and no second message on its channel** (restated W1, 2026-09-23). (a) `validate()` refuses `fx.twoWrites()` — two reply rows — under F7 with a fix naming the alternatives: update the one row through its target, write anything else beside it, or put a second message on another channel. (b) `fx.writeInClause()` — the live row inside an `each` — is refused under 01 §4, with the spine named as where it goes instead. Other writes, in clauses or not, are unlimited. | One turn leaves two reply rows behind, or N of them from inside a repeat, and nothing can say which row to stream into or finalise. |
| C22 | F8, F32 | **No pipeline triggers another.** Four halves, because there are four doors: no published definition is a trigger outlet (the host's own registry is the evidence); `assertHookSurface` refuses `trigger`, `run` and `call` on a hook surface; any definition that names the event it causes from its config (`causesEventFrom`, as `record-event` does for a package's own events) is a write outlet; and `validate()` refuses a node declaring `emits` under F8, naming the one path — a write causes the event its outlet declares, and a preset binds a pipeline to that event. | Runs start runs. A model call nobody asked for appears on no receipt as anything's consequence, and a loop between two specs has no budget and no place to break it. |
| C23 | F41 | **The effects line at a block.** (a) At publish: `form` is the one venue a block reaches, so a `world` action declaring it is refused by `validate()` under F41. (b) At the write: `worldBlockFunctions(blocks, doc)` names any `world` action a `choices` block carries, and the host refuses the write. (b) is a runtime law **because no document carries a block tree** — a spec's blocks are a node's output — with a negative control, since a gate that refused every block would break every message that offers a choice. | A block a node wrote puts an out-of-fiction button in front of a character, and permission stops being the owner's to give. |
| C24 | R-15 | **Every genre can be addressed by a form, and every shipped preset binds the pipeline that answers one** (ruled 2026-09-17). Read off `HostUnderTest.shipped()`: each genre declares `core:event/form-addressed@1` and does not make it required, and each preset binds a spec to it. | A pipeline writes a form, the reader fills it in, the press reaches no run, and no error says why. |
| C25 | plans/29 R-3, F11, F32 | **The plugin grant table.** The table itself is pinned against `hookCtxGrants` — task and chain-link get neither grant, query/outlet/event/lifecycle get `storage`, the oracle gets `storage` and `fetch` — and then the host's own endowment is judged per kind through `hookCtxKeys(kind)`: the keys equal `hookCtxKeysFor(kind)`, and `read`, `call` and `commit` reach no plugin handler. The absent `commit` is also why **a plugin write-class outlet is not available**: it emits the event it declares and core's outlet does the writing (the packager refuses the declaration up front, `E_PLUGIN_WRITE_OUTLET`). | A package reaches through a door nobody granted, and the permissions an administrator reads stop describing what it can do. |
| C26 | 20 §12, F32 | **A frame has no ambient authority.** From `HostUnderTest.frameMount()`: the sandbox is `allow-scripts` and nothing else (no `allow-same-origin`, so an opaque origin; no `allow-forms`, so a submit does not leave), and the CSP names a `default-src` floor, `script-src 'self'` — no inline script, no script from anywhere else — `form-action 'none'`, no `'unsafe-eval'` and no `'unsafe-inline'` outside `style-src`, and no off-origin source outside `connect-src` (which carries only the hosts the package declared) and the reporting directives. Supplied `accepts`, the port answers an action-firing message and nothing that commits. | A package's UI reads the session's cookies, calls the app's API as the signed-in user, or posts to an origin nobody granted. |

Five more seams a host supplies, all optional, none failing in silence:
`Fixtures.writeInClause()` and `Fixtures.worldAction()` (the documents C21 and C23 need, and
a `world` action in the `form` venue among `invalid()` for C23's publish half),
`HostUnderTest.shipped()`, `HostUnderTest.hookCtxKeys(kind)` and
`HostUnderTest.frameMount()`. A host that omits one is **skipped on that half, with the
fixture or seam named** — the same discipline as `writesSeen()` and `listActions()`: a check
the kit could compute on the host's behalf would pass any host.

## One verdict per law (C27)

Added 2026-09-17 (plans/31 V4) for the constitutional law 01 §13: *a rule has exactly one
verdict function; every door calls it and quotes its sentence; a door that re-derives a rule
is a defect.* The SDK registers its verdicts with `defineVerdict` and enumerates them with
`verdicts()`; seven are registered today — display text (R-20), enablement (U5e), audience
(R-15), the effects line (F41), form staleness (U5f), settings never travel (F39) and
provisional definitions (R-2).

| Id  | Law | Holds that | What breaks when it fails |
| --- | --- | ---------- | ------------------------- |
| C27 | 01 §13 | **Every verdict is heard at every door it declares.** For each registered verdict and each door it declares, the kit feeds `failing(door)` through the host's own door — `HostUnderTest.doors[door](verdictId, input)`, which drives the real door and answers what it refused with — and holds the answer to contain `judge(failing).sentence` (the en text) verbatim. A door may frame the sentence (a node key before it, several findings under one heading, the fix after it) but never reword it. A host without the seam is skipped naming it; a door the host lacks is skipped per verdict. | A person meets a different refusal depending on which door they came through, and a rule fixed at one door stays broken at the rest. |

The SDK's own host answers `construction`, `validate`, `registry` and `run`; the doors only a
product has — `publish`, `fire`, `write`, `list` — are the app host's to supply (plans/31 V5).

## The event map (C28, C29)

Added 2026-09-24 (PLAN-turn-order §B3). Both laws are judged by SDK functions a host's own boot
check also calls (`uncausedGenreEvents`, `unterminatedCycles`), so the kit and the host cannot
disagree about what they mean.

| Id  | Law | Holds that | What breaks when it fails |
| --- | --- | ---------- | ------------------------- |
| C28 | §B3, R33 | **Every event a shipped genre lists is caused by a write or is a declared root.** Read off `HostUnderTest.shipped()`. A declared root (`declaredRoot: true` on the event) starts outside every pipeline: `session-created`, `message-respond`, `session-action`, `member-added`, `member-removed`, `cast-changed`, `session-updated`. | A preset binds a pipeline to an event nothing ever fires, and nothing says so. |
| C29 | §B3, §3.2 | **Every loop in a genre's event map passes through a node with a termination policy.** Read off `HostUnderTest.eventMap(genre)`: the host's own map plus a termination policy per node — auto-advance's cause rule and cap, or the run caps that park a run tree, stated on the node where they actually bind (an event the host dispatches as a child of its run). A host without the seam is skipped, naming it. | One event starts a loop nothing stops: runs pile up and a model is called without end. |

## A package's own artifact (C30–C33)

C30 added 2026-09-24 (PLAN-sdk-1.0 §3.5); C31–C33 added 2026-09-26, from the gaps the Twenty
Questions plugin hit running the kit over its own build.

| Id  | Law | Holds that | What breaks when it fails |
| --- | --- | ---------- | ------------------------- |
| C30 | §3.5, R23 | **A component is judged, mounted and mirrored the way the page runs it.** Every module `components()` lists passes `componentModuleFindings` (advisories become notes); the kit's own fixture round-trips through `mountComponent` (a push reaches it, a click comes back as an `invoke`, a `<script>` is refused and said); and `componentParity()`'s native/remote pair renders the same rows, streams a reply the same way and edits through the same `edit` verb. The edit is driven **the way the widget exposes it**: the row's field is the page's `sp-composer-field` (core's `MessageComposer`), typed into by raising the field's own `input` event through `ComponentView.dispatch`; a clone that swapped in a plain `textarea` is typed into as one. | A widget that looks alive and does nothing; a clone whose cutover changes what people see. |
| C31 | §3.5, 20 §12 | **Every built component mounts in a plugin's box with nothing refused, no error, and unmounts cleanly.** Each module `components()` lists is mounted through `mountComponent(code, sections, { grants })` — its own `grants` and `sections`, else `componentParitySections()` — and holds `refused == []`, `errors == []` (`ComponentView.errors`), and an `unmount()` that neither throws nor raises. An empty box is a note. | A widget installs and shows an empty box: the page dropped what it placed (an unedited clone of core's messages widget places core's `sp-host-view`s), or it raised an error nobody reads. |
| C32 | R28, R29, R53 | **Every swap a package offers fits the node it stands in for.** For each of `swaps()`: the package declares the definition, the host seats something at `pinnedDefinition(spec, node)`, and `swapFitFinding` finds nothing. | A person picks the option and the node it replaced stops computing. |
| C33 | F11, 13 §7h | **Every definition a swap seats passes the binding probes** (B1–B5 of `@serene-pub/sdk/testing`: a discriminated result, no services for a Task, randomness from the seed only, it settles, it honours abort), over `nodeHandler(id)`, with input from `PROBE_SAMPLES` by in-port shape or the host's `probeInput(d)`. A definition reading a shape with no sample is skipped with the shapes named. | A strategy that returns a bare value, rolls `Math.random`, hangs, or ignores an admin's abort. |

The seams, all optional, none failing in silence: `components()` (each `{ id, code, grants?,
sections? }`), `mountComponent(code, sections, opts?)`, `componentParity()`, `swaps()`,
`pinnedDefinition(spec, node)`, `nodeHandler(definitionId)`, `probeInput(d)`; and on a
`ComponentView`, `dispatch`, `errors` and `settle` (the SDK harness's `mountComponent` has all
three).

### Running the package cases over a build

The helpers read the artifact the way an instance reads it at install — never the source:

- **`manifestSeams(manifest, bundle?)`** → `shipped`, `swaps`, `nodeHandler` off a parsed
  `manifest.json` and the handler bundle's code.
- **`definitionFromManifest(entry)`** — a `nodeDefinitions[]` entry back as its descriptor.
  The compiled manifest **already records full port shapes**: `declaration` is the descriptor
  verbatim (D-6b); the entry's top-level `ports`/`slots` stay the names-only audit summary,
  which an admin's screen and the install check key on, so they are not changed. An entry
  with no declaration (packaged before D-6b) is refused with "re-package".
- **`swapsFromManifest`**, **`hooksFromBundle(code)`** (evaluates the self-contained CommonJS
  bundle with a `require` that refuses — a test's evaluation, not the host's isolation),
  **`pinnedDefinitionIn(doc, node)`** (the definition a compiled spec seats, from the
  registry), **`componentParitySections()`** (the sections the parity contract names).
- **`conformPackage(host, only?)`** runs `PACKAGE_REQUIREMENTS` (C28–C33) with no fixtures;
  `conform(host, fx, { only })` runs any subset.

```ts
import { conformPackage, manifestSeams, pinnedDefinitionIn, renderConformance } from '@serene-pub/conformance'
import { mountComponent } from '@serene-pub/cli/testing'
import { coreSpec } from '@serene-pub/core-catalog'

const host = {
  name: `${manifest.slug} (built)`,
  validate, run, replay, canonicalHash, importDocument, // the SDK's reference executor
  ...manifestSeams(manifest, bundleCode),
  pinnedDefinition: (spec, node) => pinnedDefinitionIn(coreSpec(spec)?.build(), node),
  components: async () => manifest.components.map((c) => ({ id: c.slug, code: codeOf(c), grants: ['session:full'] })),
  mountComponent: (code, sections, opts) => mountComponent({ root, entry: writeAside(code), context: sections, ...opts }),
}
const results = await conformPackage(host)
console.log(renderConformance(results))
```

C29 stays "not judged" outside the app: the event map is drawn from every installed package
and core's listeners, and a map a package drew itself would pass any package.

## Running it

```
SHOW_CONFORMANCE=1 npx tsx --test sdk-tests/conformance.test.ts
```

`sdk-tests/conformance.test.ts` builds the fixtures with `spec(...)` and runs the kit
against the SDK's own executor; `95c` there proves each new law fails on a **broken host**
— one that names a stranger's row, drops a dry write's event, ignores `world.overrides`,
hands the owner's declared switches through a ctx, resolves a settings edge to a value,
lists an action twice, puts a `phone` action on `main`, calls a plugin's action by a bare
slash name, or mislabels the effects line — with a sentence naming the shape. `95d` does the same for
C21–C26: a validator that lost 01 §4 or F8, a catalogue whose genre cannot be addressed by a
form, a task handed `storage`, an outlet handed `commit`, a frame mounted with
`allow-same-origin` or served `'unsafe-inline'`. `95e` does it for C27: a host whose
`validate` door paraphrases the display-text sentence goes red naming the verdict and the door.
`sdk-tests/packageConformance.test.ts` runs C30's parity half on core's messages widget
against a clone compiled from its `source.json`, and C31–C33 over a manifest the compiler's own
projection wrote — each passing, and each failing on the shape it exists to catch.
