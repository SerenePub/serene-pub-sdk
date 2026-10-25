# Write your own rules

A **ruleset** is what a session's characters are played by: what they carry, how a risky moment
is decided (or not), what things people hold and where they sit, how an outcome reads, and how
time wears on them. Players meet it as the session's [**Rules** and **How strict**](/docs/rulesets),
and never see the word _ruleset_: the interface's words are listed in
[NOMENCLATURE §28](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md).

You can write one in two ways, and both end in the same place:

- **In the app, with no code.** **Admin › Play › Rulesets › New ruleset** walks an administrator
  through the sections on this page as sentences with pickers, shows **What the model will read**
  beside each, and runs **Playtest a scene** before anything is published.
- **In code, with `defineRuleset`.** A declaration and a ruleset made in the app are one
  **ruleset document** (`rulesetDocumentOf`), and the app's **Document** step reads and writes it.

This page is the code side, with the app's words beside it. Nothing on it assumes dice: how a
risky moment is decided is a function you reference, and a ruleset may reference none.

## Start from scratch, or from an archetype

A ruleset needs only a name. **From scratch** is `{ name }`, truly empty: no outcomes, no time, no
way to decide, no voice. A session on it reads and behaves exactly like a session with no rules;
everything the "no rules" experience needs belongs to the host, not to the ruleset.

<!-- prelude:
import { defineRuleset } from '@serene-pub/sdk'
-->
```ts
export const blank = defineRuleset('acme.tales:ruleset/blank@1', { name: { en: 'Blank' } })
```

Everything else is added, one sentence at a time. Core ships small, complete archetypes to copy,
each saved as a ruleset marked `template: true` with a sample scene ready to playtest:

| Archetype | How a risky moment is decided | Good for |
| --- | --- | --- |
| **Romance** | Affection weighed against a line; nerve spent to be brave | Slow burns, love triangles |
| **Slice of life** | The table judges; routines keep the calendar | Everyday stories, cozy towns |
| **Workplace** | A pitch weighs reputation against the ask; focus is spent | Offices, startups |
| **Card game** | Cards drawn, played and scored | Parlour games, tournaments |
| **Dice adventure** | One d20 plus a stat against a target | Fights and heroics |
| **Dice pool** | As many d6 as a stat says; count fives and sixes | Gritty, swingy play |

In the app they are the cards under **What kind of game is it?**. A template is only ever copied:
`defineRuleset` refuses one, and no session or lorebook can play it. Core also plays two finished
rulesets to read whole: **Vis Itineris** (`core:ruleset/vis-itineris@1`, a full d20 game) and
**Wherewithal** (`core:ruleset/wherewithal@1`, no dice at all).

## The seven sections

A ruleset says any of these; each is optional.

| | Section | What it holds | In the app |
| --- | --- | --- | --- |
| 1 | `attributes` | What owners carry, each with the sentence the model reads | Attributes |
| 2 | `functions` | References to the functions that make it work, with their bindings and options | Functions |
| 3 | `entryTypes` | The kinds of thing people hold, suffer or share | Entry types |
| 4 | `zoneTypes` | Where entries sit: a hand, a deck, an inbox | Zone types |
| 5 | `outcomes`, `time` | The author's outcome words and the unit time is kept in | Outcomes and time |
| 6 | `library` | Ready-made rows for each entry type | The library |
| 7 | `options` | Settings, presets and conversions | Options |

Read a ruleset through `normaliseRuleset(decl).sections`; the shapes before the sections
([below](#old-shapes)) read into them. A declaration says one shape or the other for each section,
never both (`legacy-beside-section`).

## A worked example: Romance

Romance is the shipped archetype `core:ruleset/template-romance@1`. We build a trimmed copy, one
section at a time.

### 1. Attributes: what people carry

An **attribute** is a thing an owner carries. Each has an `id` functions bind it by, a `name`, a
`kind` (`number`, `pool`, `tally`, `label`, `list` or `text`: free prose of each holder's own, read
as a sentence), its `bounds`, and **a sentence the model reads**. That sentence is the floor of every ruleset: an attribute without one is refused
(`missing-prose`). Also say who `carriedBy` (default: each character), who sees it (`visibility`: `holder`, `gm`,
`everyone`, or a scope function), who may change it (`changedBy`), its `tags` (what functions bind
by) and `shownAs`, the hint a stock widget draws it by. A holder may turn an attribute off for
themselves (the game master may for anyone): then it is not shown, read or written for them. Say
`required: true` where every holder must carry it.

<!-- prelude:
import type { RulesetAttributeDecl } from '@serene-pub/sdk'
-->
```ts
export const attributes: RulesetAttributeDecl[] = [
	{ id: 'nerve', name: { en: 'Nerve' }, kind: 'pool', bounds: { max: 5 }, start: 3, carriedBy: ['cast'], tags: ['resource'], changedBy: ['rules'], shownAs: 'bar',
		prose: 'Nerve: courage held in reserve, 0 to 5. It is spent to do something brave and comes back each morning.' },
	{ id: 'mood', name: { en: 'Mood' }, kind: 'label', of: ['guarded', 'warm', 'giddy', 'hurt', 'restless'], start: 'guarded', carriedBy: ['cast'], shownAs: 'words',
		prose: 'Mood: how someone is carrying themselves today. It colours their words and shifts after a confession.' },
]
```

A ruleset's own attribute is filed under a slot derived from the ruleset
(`rulesetAttributeSlotId`: `<owner>.<ruleset>:slot/<attribute>@<major>`), registered with it. To
use an attribute slot that already exists (core's health, mood), name it with `slot` and, when
the ruleset only borrows it, `borrowed: true`.

### 2. Functions: how things work

A **function** is a small module of core's (or a package's, or your own) that does one thing: weigh
two values, spend from a pool, judge in words, restore a pool each morning. The ruleset
**references** it by id, ties its roles to the ruleset's own attributes, entry types and zone types
(**function bindings**), and sets its options. A function never writes; it returns the changes it
proposes and the pipeline saves them, under the session's review setting.

Core's reserved ids are `CORE_FUNCTION_IDS`: the deciding functions `judge`, `dieTarget`,
`dicePool`, `cardDraw`, `compare`, `spend` and `table`; the scopes `samePlace`, `withinTie`,
`aimedAt` and `everyone`; and the value functions `workedOut`, `tally`, `typedBonuses` and
`castingPool`. A reference carries a `key`, the name it is used by; the first deciding reference is
the ruleset's default way to decide.

<!-- prelude:
import { CORE_FUNCTION_IDS as F, type FunctionRef } from '@serene-pub/sdk'
const band = (id: string, label: string, target: number, d = false) => ({ id, label: { en: label }, target, ...(d ? { default: true } : {}) })
-->
```ts
export const functions: FunctionRef[] = [
	// Nothing is rolled: how they feel about you (their side of the bond), weighed against a line.
	{ ref: F.compare, key: 'confess', options: { modifierOf: 'bond.affection', bands: [band('low', 'Hopeful', 4), band('even', 'Even', 7, true), band('high', 'Bold', 9)] } },
	// Or spend nerve to be brave before you are ready: more spent, a better result.
	{ ref: F.spend, key: 'be-brave', options: { resource: 'nerve', costs: [{ spend: 0, band: 'cooled' }, { spend: 1, band: 'awkward' }, { spend: 2, band: 'warmed' }] } },
	// Anything else, the table judges.
	{ ref: F.judge, key: 'read-the-room' },
]
```

The options are the function's own form (`FunctionProps.form`); a reference with an option it
does not take is refused (`bad-function-options`). Pin a version with `hash`, and carry a module
inside the ruleset with `module` (see [Write a function of your own](#write-a-function-of-your-own)).
The shipped archetype adds core's `recurring` function (`{ every: 'day', by: 2 }`, bound to nerve) so nerve comes back each morning.

### 3. Entry types and zone types

An **entry type** is a kind of thing people hold, suffer or share. It *is* a lorebook entry type:
it has a name and description, any `fields` of its own, `holders`, `visibility`, `tags`, and a
`prose` sentence. A held one is a **copy** stamped from its entry (`stampHeldEntry`), so the
original never changes. A **zone type** says where entries sit: whose it is (`owners`: each
character, the world, each place), what it `holds`, a `limit`, whether order matters (`ordered`), and
who sees what is in it (`visibility`). Moving an entry from one zone to another is what reveals it.

🚧 A **relational** entry type is a tie, and says what its far end may be (`farEnd`: `person`,
`place` or any `entry`). Its sides are worked out from the ends: a person to a person has two,
each person holding their own (the lorebook graph's two perspective rows); anything else has
one, held by the world (a road, a standing in a town). Romance keeps affection *on the bond*, so
each person's side holds their own number, and a check reads it as `bond.affection` — the side of
whoever the check is aimed at, towards the one checking. A one-sided tie is the world's, so a zone
type the world owns must hold it (`owners: ['world']`); without one, the ruleset is refused with
`unheld-tie`, which names the zone type to add.

🚧 A function whose role says `entryFields` may be tied to an entry's number field by the same
selector, read per held entry (a tie's per side): Romance ties `core:function/rungs@1` to
`bond.affection` with `into: 'standing'`, so the standing is worked out from the affection and kept
on the side (and, reading onto the relationship row, on the graph), and
`core:function/outcome-moves@1` to it as well, so a confession's outcome moves the side of the one
it was aimed at — `set` with `by`, never a write.

Any field may say which lorebook column it **reads onto** (`readsOnto`): a tie's words field feeds
its relationship row's type or name, so the graph keeps the words while the number stays on the
bond; a held thing's field feeds its own entry; a cast attribute (a label of the graph's cast
states) feeds the cast member's state. The host writes it whenever the value lands. And each
field says what the model is told of it (`modelShare`): its words (on unless said) and its number
(off unless said).

<!-- prelude:
import type { RulesetEntryTypeDecl, ZoneTypeDecl } from '@serene-pub/sdk'
-->
```ts
export const entryTypes: RulesetEntryTypeDecl[] = [
	{ id: 'bond', name: { en: 'Bond' }, relational: true, farEnd: 'person', tags: ['relationship'], shownAs: 'ties',
		readsOnto: { standing: 'relationship-type' },
		prose: 'Bonds: what two people are to each other. Each holds their own side, with their affection for the other, 0 to 10.',
		fields: {
			affection: { type: 'integer', min: 0, max: 10, default: 3, label: { en: 'Affection' } },
			standing: { type: 'enum', of: ['cold', 'wary', 'warm', 'close'], default: 'wary', label: { en: 'Standing' } },
		} },
	{ id: 'keepsake', name: { en: 'Keepsake' }, holders: ['cast'], tags: ['item'],
		prose: 'Keepsakes: small things kept because of someone, a note or a pressed flower.' },
]

export const zoneTypes: ZoneTypeDecl[] = [
	{ id: 'pocket', name: { en: 'Pocket' }, owners: ['cast'], holds: ['keepsake'], visibility: 'holder', limit: 5,
		prose: 'Pocket: the keepsakes someone carries close. Only they know what is in it, until they show it.' },
	{ id: 'bonds', name: { en: 'Bonds' }, owners: ['cast'], holds: ['bond'], visibility: 'holder', shownAs: 'ties',
		prose: 'Bonds: each person\'s own side of their ties. How much they feel is theirs to show.' },
]
```

### 4. Outcomes and time

**Outcomes** are the author's own words. Each may sit on the shared five-band scale (`five`) with
the least margin it starts at (`from`), so a story told in words still reads true.

<!-- prelude:
import type { RulesetOutcomeDecl, RulesetTimeSection } from '@serene-pub/sdk'
-->
```ts
export const outcomes: RulesetOutcomeDecl[] = [
	{ id: 'cooled', label: { en: 'Cooled' }, five: 'fail' },
	{ id: 'awkward', label: { en: 'Awkward' }, five: 'partial', from: -2 },
	{ id: 'warmed', label: { en: 'Warmed' }, five: 'success', from: 0 },
	{ id: 'confessed', label: { en: 'Confessed' }, five: 'crit', from: 3 },
]
export const time: RulesetTimeSection = { unit: 'day' }
```

### 5. Put it together

<!-- prelude:
import { defineRulesetTemplate, type FunctionRef, type RulesetAttributeDecl, type RulesetEntryTypeDecl, type RulesetOutcomeDecl, type RulesetTimeSection, type ZoneTypeDecl } from '@serene-pub/sdk'
declare const attributes: RulesetAttributeDecl[]
declare const functions: FunctionRef[]
declare const entryTypes: RulesetEntryTypeDecl[]
declare const zoneTypes: ZoneTypeDecl[]
declare const outcomes: RulesetOutcomeDecl[]
declare const time: RulesetTimeSection
-->
```ts
export const hollowHearts = defineRulesetTemplate('acme.tales:ruleset/template-hollow-hearts@1', {
	label: { en: 'Hollow Hearts' },
	about: { en: 'Bonds with affection on each side, nerve you spend to be brave. A confession weighs how they feel about you against a line.' },
	goodFor: { en: 'Slow burns and love triangles.' },
	ruleset: { template: true, name: { en: 'Hollow Hearts' }, attributes, functions, entryTypes, zoneTypes, outcomes, time },
	playtest: {
		party: [
			{ name: 'Wren', stats: { nerve: 3, mood: 'guarded' }, ties: { bond: { Mara: { affection: 7, standing: 'warm' } } } },
			{ name: 'Mara', stats: { nerve: 2, mood: 'warm' }, ties: { bond: { Wren: { affection: 8, standing: 'close' } } } },
		],
		situation: { en: 'The pier at dusk. Wren has been working up to it all day.' },
		change: { owner: 'Wren', op: 'use', check: 'confess', aimedAt: 'Mara', against: 7 },
	},
})
```

A real ruleset is `defineRuleset(id, { name, ... })` without the template wrapper. Each archetype
is at most sixty lines of declaration, says nothing about dungeons, and carries prose on every item.

## Write a function of your own

🚧 A function you need and core does not have is a **function module**: a header (what it is, what
it binds, what it adds) and, when it does work, a body that runs in the sandbox. Declare it with
`defineFunction`; a ruleset in the same package references it, or carries it with `module`.

<!-- prelude:
import { defineFunction, NUMBER_ATTRIBUTE_KINDS } from '@serene-pub/sdk'
-->
```ts
export const warmUp = defineFunction('acme.tales:function/warm-up@1', {
	name: { en: 'Warm up' },
	meaning: { en: 'Someone shown a kindness warms to the person who showed it.' },
	kind: 'changing',
	// It adds one, so it takes a number: a number, a pool or a tally — never a word or free text.
	bindings: { what: { to: 'attribute', tags: ['towards'], kinds: NUMBER_ATTRIBUTE_KINDS } },
	prose: 'A kindness shown raises {{what}} for the person who showed it.',
	phases: ['effects'],
	body: 'function effects(ctx) { return { deltas: [{ attribute: ctx.what, by: 1 }], lines: ["A kindness warms them."] } }',
})
```

🚧 Say what each attribute role takes with `kinds` (`ATTRIBUTE_KINDS`: `number`, `pool`, `tally`,
`label`, `list`, `text`; left out, any kind). A sum takes `NUMBER_ATTRIBUTE_KINDS`; a function that
reads a word takes `['label', 'text']`. A ruleset that ties the role to an attribute of another kind
is refused (`bad-binding-kind`, naming the role, the attribute and what it takes), the editor offers
only the attributes it takes and says why the others are missing, and the sandbox never hands the
body a word where it asked for a number. A role an entry's field may fill says `entryFields: true`
for a number field, or the field types it takes (`['string', 'enum']`).

A body returns `{ deltas, lines, outcomes, emits, asks }` and never writes. Events it `emits` are
collected and raised after the receipt. A function with no body is **header-only**: its `prose`
is what the model reads, and the table judges. Editing a core function **forks** it
(`forkFunction`) into your ruleset and records `forkedFrom`.

## Entry types you borrow, tags you choose

Functions find what they act on by tag: `tags: ['resource']` on an attribute, `['relationship']`
on an entry type. Core reads `condition`, `casting`, `weapon`, `armour`, `relationship`,
`resource`, `exit` and a few more; any other tag is yours.

## Check it

`defineRuleset` refuses a ruleset with every reason it found, each opened by its reason's name:
`[missing-prose]` for an attribute with no sentence, `[unknown-function]` for a reference to a
function that is not registered or reserved, `[unbound-function-binding]` for a role nothing
fills. `rulesetSectionFindings(id, sections)` runs the section checks alone;
`rulesetWarnings(decl)` lists what is accepted but should change.

<!-- prelude:
import { rulesetWarnings, type RulesetDecl } from '@serene-pub/sdk'
declare const swords: RulesetDecl
-->
```ts
for (const line of rulesetWarnings(swords)) console.warn(line)
```

## Playtest a scene

Before anyone plays it, put the rules through one turn. **Playtest a scene** seats a small party
(one to four, each with attributes and held entries from the library), takes the situation in a
sentence and one change, and runs it as a turn would:

- **Run the scene** shows what was decided and why (**How it was decided**), the changes it
  proposes (under Review: the function wrote nothing), the events it will raise at the end, and
  **What the model would read** with its size. The same seed rolls the same dice.
- **Ask a model** hands the decided outcome to the Reply loadout and shows how it would be told.
- **Run it 200 times** tells you how often each outcome comes up; **Save as a test** keeps the scene
  and checks it again each time the rules change.

Nothing a playtest does is saved. A template carries its scene as `playtest`
(`RulesetPlaytest`: `party`, `situation`, `change`), which is what a copy opens with.

## The handbook

The **handbook** is a page players read, generated from the sentences you wrote: how to play, what
people carry, how things are decided, the things people keep, how outcomes read and time.
`renderHandbook(ruleset)` from `@serene-pub/cli` returns its pages and the whole as Markdown.
Beside it you add pages of your own; one whose title matches a generated page replaces it. A genre
has a handbook too.

<!-- prelude:
import { renderHandbook } from '@serene-pub/cli'
import type { RulesetDecl } from '@serene-pub/sdk'
declare const hollowHearts: { ruleset: RulesetDecl }
-->
```ts
const book = renderHandbook(hollowHearts.ruleset)
for (const page of book.pages) console.log(page.source, page.title)
```

🚧 The pages you write live in a `handbook: [{ title, body }]` field on the ruleset (and on a genre).
In the app, **Add a page** writes it.

## Publishing

A ruleset reaches sessions by being published on a pub.

1. **Admin › Play › Rulesets › New ruleset**: an owner name of your own, a label, and a starting
   point (from scratch, an archetype, a copy or a pasted document).
2. The **Document** step takes a whole ruleset as JSON: paste
   `JSON.stringify(rulesetDocumentOf(decl))`. Every save lists anything that stops it publishing.
3. **Check and publish** gives it a version (1.0.0, then 1.0.1). A publish that drops or reshapes
   something stored (an attribute gone, a field holding another kind of value) lists each change
   and asks first.

A plugin package can't carry a ruleset yet: `defineExtension` has no field for one. Share a
ruleset as its document for now.

## Old shapes

A ruleset written before the sections still loads, and reads into them (`rulesetSections`,
`normaliseRuleset`): `stats` become attributes, `repertoires` entry types, `conventions.methods`
and `selectors` function references (a check method of kind `compare` reads as `core:function/compare@1`),
`scripts` carried function modules, `conventions.degrees` outcomes, `conventions.time`, `actions`
and `rest` the time section, `compendium` the library, and `settings`, `presets` and `conversions`
the options. Rulesets made on a pub before this were rewritten once by a data upgrade. Write
the sections.

| Shape before | Section |
| --- | --- |
| `stats` | `attributes` |
| `repertoires` | `entryTypes` |
| `conventions.methods`, `selectors` | `functions` |
| `scripts` | `functions` (carried modules) |
| `conventions.degrees` | `outcomes` |
| `conventions.time`, `actions`, `rest` | `time` |
| `compendium` | `library` |
| `settings`, `presets`, `conversions` | `options` |

The words the app shows players are `Rules`, `How strict` and the ones in the interface: never
ruleset, rigour, repertoire or piece.
