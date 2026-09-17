import { specGraphOf } from '@serene-pub/docs';
export { specGraphOf };
/**
 * The resolver `compileDocs({ resolvers: { pipeline } })` wants, over one
 * package's announcement: an id it announces draws, anything else is null and
 * fails the compile naming the page that asked.
 *
 * The announcement is the source, and it is enough: `announce()` compiles every
 * builder chain on its way into `.document`, so `AnnouncementDocument` already
 * carries `SpecDocument[]` — the same bytes a package ships. Nothing here needs
 * `CORE_SPECS[].build()`, which would re-derive documents the announcement is
 * already holding and could disagree with them.
 */
export function pipelineResolver(announcement) {
    const byId = new Map(announcement.pipelines.map((doc) => [doc.id, doc]));
    return (id) => {
        const doc = byId.get(id);
        return doc ? specGraphOf(doc) : null;
    };
}
//# sourceMappingURL=docsGraph.js.map