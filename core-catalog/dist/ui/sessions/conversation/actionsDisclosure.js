/**
 * When the composer's **Actions** disclosure closes (ruled 2026-09-17).
 *
 * The row is a disclosure, not a menu (STYLE-GUIDE §6.6, §9): it closes when
 * its own toggle is pressed, or on Escape while focus is inside it — and
 * never because focus left it. A `focusout` close is the one thing this table
 * refuses, because it fires on the `mousedown` of the first press anywhere in
 * the transcript after a chip has been used: the row unmounts, the composer
 * shrinks, the bottom-anchored message list shifts by the row's height under
 * the pointer, and `mouseup` lands on a different element — the browser then
 * dispatches `click` on the common ancestor and the button never hears it.
 * A choice button, a message menu, a swipe arrow: each dead on the first
 * press, alive on the second (reproduced live 2026-09-17).
 *
 * The table lives here rather than in the component so the ruling has a
 * test the component cannot host: the suite has no browser environment
 * (`vitest.config.ts` runs everything on `node`), and `render` from
 * `svelte/server` sees markup, not events.
 */
const STAY = { close: false, returnFocus: false };
/** Whether an open Actions disclosure closes for `reason`, and where focus goes. */
export function shouldCloseActions(input) {
    switch (input.reason) {
        case 'toggle':
            // The toggle already has focus; nothing to return.
            return { close: true, returnFocus: false };
        case 'escape':
            if (input.overflowOpen)
                return STAY;
            return { close: true, returnFocus: input.focusInside };
        case 'focusout':
            // A disclosure is not a menu: focus moving on — to the transcript, the
            // field, another window — is not a request to close it.
            return STAY;
    }
}
//# sourceMappingURL=actionsDisclosure.js.map