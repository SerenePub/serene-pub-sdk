/**
 * The **widget declaration** a package ships (`WidgetDecl`) and its parts:
 * what a widget renders, the data it asks for, the styles and settings it
 * offers. Where an instance of it sits is the **session layout**'s business
 * (`sessionLayout.ts`, `SessionLayoutV1`); a declaration never says.
 *
 * It lives beside `settings.ts` and `descriptors.ts` because it is a public
 * contract on the same terms as those, and it imports only their types so
 * `descriptors.ts` can name `WidgetDecl` without a cycle.
 *
 * The file kept its name when the retired layout document (LayoutDoc v2) and
 * its machinery left it (plan `PLAN-layout-one-format-2026-09-28`, brief 1):
 * the widget half is what stayed.
 */
/**
 * The globally-unique, reseed-stable slug for a widget's built-in style. This is
 * both the system row's `slug` (the layout's reference target) and its seed
 * identity — the reconciler upserts and prunes system rows by matching on it,
 * NEVER on a numeric id (the codified seed rule).
 *
 * Widget ids and preset slugs are simple kebab tokens (no `:`), so the join is
 * unambiguous.
 * @internal
 */
export function systemStyleSlug(widgetId, presetSlug) {
    return `${widgetId}:${presetSlug}`;
}
/**
 * Resolve a widget declaration to what the host mounts. `owner` is `'core'`
 * or the declaring plugin's id: a `component` is that owner's remote. `null`
 * when the declaration names no component — validation reports that; the
 * host treats it as a missing widget, never a crash.
 * @internal
 */
export function resolveWidgetSurface(decl, owner) {
    if (typeof decl.component === 'string' && decl.component)
        return { kind: 'remote', owner, component: decl.component };
    return null;
}
//# sourceMappingURL=layout.js.map