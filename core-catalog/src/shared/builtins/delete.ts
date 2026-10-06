/**
 * The built-in **delete** write as a spec; see `builtIn.ts`.
 */

import { compile, BUILTIN_SPEC_IDS } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { builtIn } from './builtIn.js'

/** @experimental */
export const BUILTIN_DELETE_SPEC_ID = BUILTIN_SPEC_IDS.delete

/** @experimental */
export const builtinDeleteSpec = () =>
	compile(
		builtIn(BUILTIN_DELETE_SPEC_ID)
			.outlet('write', ($) => C.deleteMessage.v1({ target: $.input.target }))
			.build(),
	)
