// Writes guides/plugin-permissions.md from the grant table (K1c). A test holds the
// committed file to this output, so run it after changing the table or a rule.
import { writeFileSync } from 'node:fs'
import { PLUGIN_PERMISSIONS_GUIDE, renderPluginPermissionsGuide } from '../sdk/src/pluginPermissions.js'

writeFileSync(new URL(`../${PLUGIN_PERMISSIONS_GUIDE}`, import.meta.url), renderPluginPermissionsGuide())
