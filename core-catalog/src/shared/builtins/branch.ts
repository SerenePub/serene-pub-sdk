/**
 * The built-in **branch** write as a spec; see `builtIn.ts`.
 */

import { compile, BUILTIN_SPEC_IDS } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { builtIn } from './builtIn.js'

/** @experimental */
export const BUILTIN_BRANCH_SPEC_ID = BUILTIN_SPEC_IDS.branch

/** @experimental */
export const builtinBranchSpec = () =>
	compile(
		builtIn(BUILTIN_BRANCH_SPEC_ID)
			.outlet('write', ($) =>
				C.branchSession.v1({ fromMessage: $.input.fromMessage, title: $.input.title }),
			)
			.build(),
	)
