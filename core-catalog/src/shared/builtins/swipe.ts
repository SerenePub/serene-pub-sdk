/**
 * The built-in **swipe** write as a spec; see `builtIn.ts`.
 */

import { compile, BUILTIN_SPEC_IDS } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { builtIn } from './builtIn.js'

/** @experimental */
export const BUILTIN_SWIPE_SPEC_ID = BUILTIN_SPEC_IDS.swipe

/** @experimental */
export const builtinSwipeSpec = () =>
	compile(
		builtIn(BUILTIN_SWIPE_SPEC_ID)
			.outlet('write', ($) =>
				C.swipeMessage.v1({
					target: $.input.target,
					index: $.input.index,
					text: $.input.text,
				}),
			)
			.build(),
	)
