// Writes sdk/host-elements.d.ts from SP_HOST_ELEMENTS — the editor typings
// for the host-element vocabulary. Run after `npm run build -w sdk`; the SDK's
// tests fail when the checked-in file and the table disagree.
import { writeFileSync } from 'node:fs'
import { hostElementsDts } from '../dist/hostElements.js'

writeFileSync(new URL('../host-elements.d.ts', import.meta.url), hostElementsDts())
