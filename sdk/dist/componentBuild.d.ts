/** @experimental What a built component was built against (F1). Additive: a reader ignores fields it does not know. */
export interface ComponentBuiltAgainst {
    /** The widget protocol (`WIDGET_PROTOCOL`) the artifact speaks. */
    widgetProtocol: number;
    /** The host-element vocabulary (`HOST_ELEMENTS_VERSION`, `major.minor`) it places elements from. */
    hostElements: string;
    /** `@serene-pub/sdk`'s version as the build resolved it — for the reader, never compared. */
    sdk?: string;
    /** `@serene-pub/component-client`'s version as the build resolved it — for the reader, never compared. */
    componentClient?: string;
}
/**
 * @experimental (F1)
 *
 * The widget protocols this host mounts a component built for. A host that
 * moves to a new protocol keeps the old one here for as long as it still
 * speaks it; one it drops is refused, by name.
 */
export declare const HOST_WIDGET_PROTOCOLS: readonly number[];
/** @experimental The host-element vocabulary majors this host mounts a component built for (F1). */
export declare const HOST_ELEMENTS_MAJORS: readonly number[];
/** @experimental The contract this SDK's build records: the two versions that decide (F1). */
export declare function currentBuiltAgainst(versions?: {
    sdk?: string;
    componentClient?: string;
}): ComponentBuiltAgainst;
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
export declare function componentBuiltAgainstFinding(builtAgainst: unknown, host?: {
    widgetProtocols?: readonly number[];
    hostElementsMajors?: readonly number[];
    hostElements?: string;
}): string | undefined;
//# sourceMappingURL=componentBuild.d.ts.map