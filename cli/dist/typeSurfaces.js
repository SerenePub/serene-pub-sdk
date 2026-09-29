/** @internal */
export async function typeSurfaces() {
    const { allDefinitions, allScriptKinds, snapshotRegistry } = await import('@serene-pub/sdk');
    await import('@serene-pub/contracts');
    const entries = snapshotRegistry([...allDefinitions(), ...allScriptKinds()], {
        release: 'cli',
    });
    return (definitionId, version) => entries.find((e) => e.id === definitionId && e.version === version);
}
//# sourceMappingURL=typeSurfaces.js.map