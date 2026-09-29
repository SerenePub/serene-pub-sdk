/**
 * What a built component was built AGAINST (F1): the host contract a
 * compiled artifact assumes, recorded beside it so a host that has moved on
 * refuses it with a sentence instead of mounting it into a failure nobody can
 * read.
 *
 * An artifact bundles its own Svelte and its own copy of the component
 * client, so a component compiled today keeps working as core updates —
 * except where the HOST's side drifts: the widget protocol (the verbs and the
 * message kinds, {@link WIDGET_PROTOCOL}) and the host-element vocabulary
 * (the `sp-*` tags and every attribute the receiver mirrors,
 * {@link HOST_ELEMENTS_VERSION}). Those two decide; the package versions are
 * recorded for the person reading a refusal, never compared.
 *
 * Recorded by the CLI's packager on each manifest component entry
 * (`components[].builtAgainst`) and by the in-app compiler on each compile.
 * An entry WITHOUT one predates the record and is judged compatible — every
 * component built before it was built for protocol 2, vocabulary 1.
 */
import { HOST_ELEMENTS_VERSION } from './hostElements.js';
import { WIDGET_PROTOCOL } from './widgets.js';
/**
 * @experimental (F1)
 *
 * The widget protocols this host mounts a component built for. A host that
 * moves to a new protocol keeps the old one here for as long as it still
 * speaks it; one it drops is refused, by name.
 */
export const HOST_WIDGET_PROTOCOLS = Object.freeze([WIDGET_PROTOCOL]);
/** @experimental The host-element vocabulary majors this host mounts a component built for (F1). */
export const HOST_ELEMENTS_MAJORS = Object.freeze([vocabularyMajor(HOST_ELEMENTS_VERSION)]);
/** @experimental The contract this SDK's build records: the two versions that decide (F1). */
export function currentBuiltAgainst(versions = {}) {
    return {
        widgetProtocol: WIDGET_PROTOCOL,
        hostElements: HOST_ELEMENTS_VERSION,
        ...(versions.sdk ? { sdk: versions.sdk } : {}),
        ...(versions.componentClient ? { componentClient: versions.componentClient } : {}),
    };
}
function vocabularyMajor(v) {
    if (typeof v !== 'string')
        return undefined;
    const m = /^(\d+)\.(\d+)$/.exec(v);
    return m ? Number(m[1]) : undefined;
}
const list = (xs) => (xs.length === 1 ? String(xs[0]) : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
/**
 * @experimental (F1)
 *
 * Why this host must NOT mount a component built against `builtAgainst`, as
 * a sentence — or `undefined` when it may. Absent (`undefined` / `null`) is
 * a component from before the record, judged compatible; present but
 * unreadable is refused, since a host cannot tell what it assumes.
 *
 * - a widget protocol the host does not speak: `built for widget protocol 3;
 *   this host speaks 2`;
 * - a vocabulary major the host lacks: `built for host-element vocabulary
 *   2.0; this host has 1.4`. A newer MINOR mounts (see
 *   {@link HOST_ELEMENTS_VERSION}).
 *
 * `host` defaults to this SDK's own contract.
 */
export function componentBuiltAgainstFinding(builtAgainst, host = {}) {
    if (builtAgainst === undefined || builtAgainst === null)
        return undefined;
    const protocols = host.widgetProtocols ?? HOST_WIDGET_PROTOCOLS;
    const majors = host.hostElementsMajors ?? HOST_ELEMENTS_MAJORS;
    const vocabulary = host.hostElements ?? HOST_ELEMENTS_VERSION;
    const b = builtAgainst;
    if (typeof builtAgainst !== 'object' || Array.isArray(builtAgainst))
        return 'its build record (builtAgainst) is not readable, so this host cannot tell what it was built for';
    if (typeof b.widgetProtocol !== 'number' || !Number.isInteger(b.widgetProtocol))
        return 'its build record names no widget protocol, so this host cannot tell what it was built for';
    if (!protocols.includes(b.widgetProtocol))
        return `built for widget protocol ${b.widgetProtocol}; this host speaks ${list(protocols)}`;
    const major = vocabularyMajor(b.hostElements);
    if (major === undefined)
        return 'its build record names no host-element vocabulary (major.minor), so this host cannot tell what it was built for';
    if (!majors.includes(major))
        return `built for host-element vocabulary ${b.hostElements}; this host has ${vocabulary}`;
    return undefined;
}
//# sourceMappingURL=componentBuild.js.map