/**
 * 🚧 **Describe a likeness** — a card's likeness prompt written from its
 * likeness image (DESIGN-image-generation §5, *Describe from image*;
 * follow-up D1, 2026-10-12).
 *
 * Pressed on the card's Likeness tab: a card action, so it runs with no
 * session. Three steps, every input written out:
 *
 *   input     (card action)          the card's likeness image (else its avatar)
 *   generate  (oracle describe-image) a model that reads pictures, asked the
 *                                     **Describe a likeness** row's question
 *   clean     (clean-image-prompt)   the answer as one tag line
 *
 * No outlet: nothing is written. The host reads `clean`'s prompt off the
 * receipt and hands it to the Likeness tab, which fills the **Likeness
 * prompt** field; the person saves it with the rest of the form, or not.
 *
 * No loadout either: the describe step's connection requires
 * `text+image->text`, so an unset slot runs on that job's default — the
 * model the pub reads pictures with — and the tab shows the button only
 * when one is set. The step is keyed `generate` because that is the oracle
 * the host's config world projects a job default onto by what its slot
 * `requires` (`config/world.ts`, `ORACLE_NODE_KEY`); any other key would
 * fall back by SHAPE, and this node's shape is text's.
 *
 * Genre-less (`core:spec/<what>`, NOMENCLATURE §24 rule 7): a card belongs to
 * no genre.
 */
import { compile, spec, slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/** @experimental */
export const DESCRIBE_LIKENESS_SPEC_ID = 'core:spec/describe-likeness'
/** @internal */
export const DESCRIBE_LIKENESS_VERSION = '1.0.0'

/** The step keys a host reads by name. @internal */
export const DESCRIBE_LIKENESS_NODES = {
	describe: 'generate',
	clean: 'clean',
} as const

/** The shipped row's seed key. @internal */
export const DESCRIBE_LIKENESS_PROMPT_SEED_KEY =
	'pipeline-prompt:core:oracle/describe-image:prompts:describe-likeness'

/** @experimental */
export const describeLikenessSpec = () =>
	compile(
		spec(DESCRIBE_LIKENESS_SPEC_ID, {
			version: DESCRIBE_LIKENESS_VERSION,
			taxonomy: { role: 'action' },
		})
			/** The card action: the card's likeness image, resolved once by the host. */
			.inlet('input', C.cardAction.v1())
			/** The picture, read by a model that sees images, against the prompt row. */
			.oracle('generate', ($) =>
				C.describeImage.v1({
					images: $.input.likenessImage,
					connection: slot.connection(),
					sampling: slot.sampling(),
					prompts: slot.prompts(),
				}),
				{
					expose: {
						status: 'Looking at the picture',
						label: 'Describe',
						purpose: "Writes the likeness prompt from the character's picture.",
					},
				},
			)
			/** Quotes, labels and line breaks out: one comma-separated line. */
			.task('clean', ($) => C.cleanImagePrompt.v1({ text: $.generate.text }))
			.build(),
	)
