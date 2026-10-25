/**
 * 🚧 Dungeon Crawler's two assembly templates. The builders its specs share
 * — `scriptStep`, `jsonPart`, `textPart`, `modelCall`, the `Wiring` — moved to
 * `shared/calls.ts` on 2026-10-19 (the Story genre's reckoning and sweep use
 * them too) and are re-exported here, so every import of this module reads
 * as it did.
 */

export {
	applyWiring,
	chainIf,
	chainOf,
	jsonPart,
	keyOf,
	later,
	modelCall,
	on,
	readOn,
	scriptStep,
	sibling,
	textPart,
	wiring,
	type BranchOf,
	type CallTerms,
	type Chain,
	type ChainNodes,
	type NodeLater,
	type NodeOn,
	type Plus,
	type ReadOn,
	type Wiring,
} from '../../shared/calls.js'

/**
 * 🚧 The assembly template of a call whose brief is its **last user turn**
 * — `shared/calls.ts`' `BRIEF_TURN_TEMPLATE`, under the name Dungeon
 * Crawler's specs have always read it by. A re-export, never a copy: the
 * two modules import each other through the genre's scripts, so a `const`
 * alias here would read the binding before it exists.
 * @experimental
 */
export { BRIEF_TURN_TEMPLATE as DUNGEON_CRAWLER_BRIEF_TEMPLATE } from '../../shared/calls.js'

/**
 * 🚧 The Narrator's round, laid out to **end on a user turn** (owner ruling
 * 2026-10-18, the 100-turn walk's B1): the shipped layout's system block,
 * the story so far, then the prompt row's post-history text — the round's
 * outcomes and the reminder — as the last user turn, and only then the
 * seed line (`Narrator:`), which the chat wire drops and a completion
 * prompt leaves open for the model to write into. Under the shipped layout
 * the reminder went out as a trailing system message — after the player's
 * line, or after the Narrator's own on a round nobody spoke in — and a
 * strict chat model answered nothing, every turn. The seed is the
 * transcript's `-2` row (`process-messages@1`), drawn last by its id.
 * @experimental
 */
export const DUNGEON_CRAWLER_NARRATE_TEMPLATE = `{{#systemBlock}}
{{#if instructions}}
{{{instructions}}}
{{/if}}

{{#if characters}}
{{{characters}}}
{{/if}}

{{#if personas}}
{{{personas}}}
{{/if}}

{{#if scenario}}
{{{scenario}}}
{{/if}}
{{/systemBlock}}

{{#each sessionMessages as |sessionMessage msgIndex|}}
{{#unless (eq id -2)}}
{{#if (eq role "assistant")}}
{{#assistantBlock}}
{{{name}}}: {{{message}}}{{{attachments}}}
{{/assistantBlock}}
{{/if}}
{{#if (eq role "user")}}
{{#userBlock}}
{{{name}}}: {{{message}}}{{{attachments}}}
{{/userBlock}}
{{/if}}
{{/unless}}
{{/each}}

{{#if postHistoryInstructions}}
{{#userBlock}}
{{{postHistoryInstructions}}}
{{/userBlock}}
{{/if}}

{{#each sessionMessages as |sessionMessage msgIndex|}}
{{#if (eq id -2)}}
{{#assistantBlock}}
{{{name}}}: {{{message}}}
{{/assistantBlock}}
{{/if}}
{{/each}}`
