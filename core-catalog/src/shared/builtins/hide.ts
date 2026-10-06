/**
 * The built-in **hide** write as a spec; see `builtIn.ts`.
 */

import { compile, BUILTIN_SPEC_IDS } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { builtIn } from './builtIn.js'

/** @experimental */
export const BUILTIN_HIDE_SPEC_ID = BUILTIN_SPEC_IDS.hide

/** @experimental */
export const builtinHideSpec = () =>
	compile(
		builtIn(BUILTIN_HIDE_SPEC_ID)
			.outlet('write', ($) =>
				C.hideMessage.v1({ target: $.input.target, hidden: $.input.hidden }),
			)
			.build(),
	)
