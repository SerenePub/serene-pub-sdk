/**
 * Core's widgets read their widget context with their own `getContext`, so
 * the lookup resolves in whichever Svelte runtime renders them — the
 * component's, in the page's UI worker. The key and the context's shape are
 * the host's contract (`@serene-pub/core-catalog/widgets`). Shared by every
 * core widget (R21); the conversation was the first.
 */
import { getContext } from 'svelte'
import { WIDGET_CONTEXT_KEY, type WidgetContextRef } from '@serene-pub/core-catalog/widgets'

/** The widget context, if a host provides one; undefined outside a host (tests, a bare mount). */
export function useWidgetContext(): WidgetContextRef | undefined {
	return getContext<WidgetContextRef | undefined>(WIDGET_CONTEXT_KEY)
}
