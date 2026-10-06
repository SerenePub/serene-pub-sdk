/**
 * The built-in **edit** write as a spec; see `builtIn.ts`.
 */

import { compile, BUILTIN_SPEC_IDS } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { builtIn } from './builtIn.js'

/** @experimental */
export const BUILTIN_EDIT_SPEC_ID = BUILTIN_SPEC_IDS.edit

/** @experimental */
export const builtinEditSpec = () =>
	compile(
		builtIn(BUILTIN_EDIT_SPEC_ID)
			.outlet('write', ($) => C.editMessage.v1({ target: $.input.target, text: $.input.text }))
			.build(),
	)
