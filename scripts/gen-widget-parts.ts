// Writes the widget-parts list into guides/widgets.md from core-catalog's
// components. A test holds the committed guide to this output, so run it after
// adding, renaming or removing a `data-widget-part` in a core component.
import { readFileSync, writeFileSync } from 'node:fs'
import { renderWidgetParts, withWidgetParts, WIDGET_PARTS_GUIDE } from './widgetParts.js'

const file = new URL(`../${WIDGET_PARTS_GUIDE}`, import.meta.url)
writeFileSync(file, withWidgetParts(readFileSync(file, 'utf8'), renderWidgetParts()))
