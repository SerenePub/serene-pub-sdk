/**
 * Shapes — versioned edge/payload contracts (01 §1, §3).
 *
 * A shape is the unit of compatibility. Two nodes connect if the upstream port's
 * shape is assignable to the downstream port's. Shapes are also connection kinds
 * and sampling-config kinds (F17), which is what makes the system modality-agnostic:
 * nothing anywhere switches on "is this an LLM".
 */
export type ShapeId = string;
export interface ShapeDef {
    id: ShapeId;
    /** Shapes this one may be assigned to. A stream is assignable to its settled form. */
    assignableTo?: ShapeId[];
    /** True if a downstream node may begin consuming before the value settles (F22). */
    streaming?: boolean;
}
export declare function defineShape(def: ShapeDef): ShapeId;
export declare function getShape(id: ShapeId): ShapeDef | undefined;
export declare function isStreaming(id: ShapeId): boolean;
/** The permissive sink: anything serializable may flow into a json port. */
export declare const JSON_SHAPE = "core:shape/json@1";
/** Assignability: identical, into json, or declared assignable (transitively). */
export declare function assignable(from: ShapeId, to: ShapeId, seen?: Set<string>): boolean;
/** Reset — test isolation only. */
export declare function _clearShapes(): void;
export declare const S: {
    readonly text: string;
    readonly textStream: string;
    readonly sessionScope: string;
    readonly messages: string;
    readonly candidates: string;
    readonly renderedBlocks: string;
    readonly assembled: string;
    /**
     * What Assemble publishes after the allocation/formatting split (16 §7): ordered
     * **blocks** with role, source, token count and a `why` trail — not prose. The
     * Provider's `wire` slot turns it into whatever its connection actually wants.
     *
     * Assignable to `assembled-context@1` so existing specs keep connecting while core
     * migrates; the reverse is not assignable, because a rendered string has already
     * thrown away everything the panel and the budget need.
     */
    readonly allocated: string;
    /**
     * The object a context template renders against: characters, personas,
     * scenario, the prompt texts, the resolved names.
     *
     * Its own shape rather than `json@1` so that a plugin supplying an alternative
     * context builder has something to publish, and so a spec that wires the wrong
     * node into Assemble's context port fails at publish rather than rendering a
     * template full of blanks — which reads as a broken template, and sends the
     * user to the wrong screen.
     */
    /**
     * The chat's cast and prompt config, as rows — before any decision about who
     * is shown or named. The input to the context builder, kept distinct from the
     * built context so the two can be replaced independently.
     */
    readonly sessionCast: string;
    /**
     * The MCP connection kind (14 §1). A connection whose shape is `mcp` is a
     * Model Context Protocol server core talks to — foreign code SP speaks
     * JSON-RPC with, never code SP loads. The shape doubles as the connection
     * kind (F17), so only MCP connections are offerable on an MCP provider's
     * connection slot.
     */
    readonly mcp: string;
    readonly templateContext: string;
    readonly vector: string;
    readonly budget: string;
    readonly rowIds: string;
    /**
     * The output of an async block or a map (01 §1, 13 §1). An ordered list in
     * **declaration order**, one entry per branch — never a merged object, because
     * merging needs a field-collision policy and every such policy is wrong for
     * somebody. `async` and `map` produce the same shape, so one equivalence
     * harness covers both (F26).
     */
    readonly branchResults: string;
    /**
     * What a **gate-eligible** Consumer publishes (13 §7j-b). Discriminated, because
     * under `async` review the write is a proposal a reviewer may still reject — and
     * a proposal id in a shared id space is indistinguishable from a real row id
     * right up until the foreign key dangles.
     *
     * Deliberately **not** assignable to `row-ids@1`. That is the whole enforcement:
     * a downstream node that wants ids must declare this port shape and handle both
     * cases in its hook, or the existing port-mismatch error fires at publish. There
     * is no branch node to check `status` with (F25), so the obligation belongs to
     * the type, not to the spec.
     */
    readonly writeResult: string;
    /**
     * A request to summarize something into a lore entry.
     *
     * Its own shape rather than `json@1` because it is what the summarize
     * pipelines take as *input*, and 11 §2 matches an event's payload against a
     * pipeline's Input contract by shape. A request typed as bare json would make
     * every pipeline compatible with every event.
     */
    readonly summarizeRequest: string;
    /**
     * The ordered batch drafts phase 1 produces, before synthesis merges them.
     *
     * Ordered, and the order is load-bearing: the drafts are chronological
     * slices of a conversation and synthesis reads them as a sequence. A shape
     * that permitted reordering would turn a narrative into a pile of events.
     */
    readonly drafts: string;
    /** Scenes with their messages, as the graph builder walks them. */
    readonly graphScenes: string;
    /**
     * A proposed set of graph nodes and relationships, before a person approves it.
     *
     * Distinct from anything holding row ids, for the reason `write-result@1`
     * exists: a proposal is not yet a row, and a downstream node that treated it
     * as one would wire a foreign key to something a reviewer may still reject.
     */
    readonly graphProposal: string;
    /**
     * Who speaks next, and how that was decided (19 §5).
     *
     * Its own shape rather than `row-ids@1` because it is the swap-list
     * membership test: a task whose `main` publishes this shape *is* a
     * next-speaker strategy, and the dropdown is a SELECT over such rows — an
     * extension's strategy appears beside core's by existing, the same way a
     * chat mode does. The bundle carries `{characterId, strategy, via}`; the
     * bare id rides a separate `characterId` port for wiring.
     */
    readonly speakerSelection: string;
    /**
     * A reference to stored media of any kind — the general port type.
     *
     * `image@1` and `audio@1` stay, and are assignable **to** this, so every
     * spec wired to them keeps connecting while the general ports arrive. The
     * reverse is not assignable: a port that accepts any media cannot be handed
     * to one that has declared it only understands images. Same rule, and the
     * same reason, as `allocated-context` → `assembled-context`.
     */
    readonly media: string;
    /** An ordered list of media references — what a multimodal request carries
     *  as its attachments. */
    readonly mediaList: string;
    readonly audio: string;
    readonly image: string;
    readonly json: string;
    /**
     * A model reply as an ordered list of typed parts (text, reasoning, media,
     * tool calls) rather than a string — see `OutputPart` in media.ts for why
     * that is now the honest shape of a completion.
     *
     * Assignable **to** `text-stream@1`, so a provider may start emitting parts
     * without breaking a single spec wired to its text output: the degrade
     * concatenates the prose and drops the rest. Not assignable in reverse,
     * because by then the ordering and the media are gone — the same
     * richer-to-poorer rule the allocated/assembled pair established.
     */
    readonly partStream: string;
    readonly textGen: string;
    /**
     * Vector embedding — the connection kind, and deliberately **not** a
     * sampling vocabulary (yet).
     *
     * It is absent from `SAMPLING_SCHEMAS` on purpose, and the reason is
     * structural rather than unfinished work: every parameter an embedding call
     * would take — input truncation, pooling, normalisation, output dimensions,
     * the asymmetric query/passage prefixes E5/BGE/GTE want — changes what a
     * *stored* vector means, and nothing records which setting produced the
     * vectors already in the table. A text sampler affects one reply; an
     * embedding parameter silently re-defines a whole persistent index against
     * rows that will never be recomputed. That is the same re-index story the
     * prefixes are held back for, so none of them ship until it is decided.
     *
     * What is left after removing those is either not per-invocation at all
     * (model identity, transport, residency TTL — those belong to the
     * connection) or has no consumer (nothing chunks a batch). An empty
     * vocabulary is worse than no vocabulary here: `isKnownSamplingShape` in
     * core admits any shape this record has a key for, so registering `{}`
     * would let the write path accept a config that exists, looks saved, and
     * can never send anything — the exact state that guard was written to
     * refuse.
     */
    readonly embeddings: string;
    /**
     * Named-entity recognition — the connection kind for a mention detector.
     *
     * Declared ahead of its adapter so the model side has a stable noun to
     * name; core's extractor is dictionary-based and model-free today
     * (`core:extract/entities-heuristic@1`), and takes no parameters at all
     * beyond the text and the gazetteer.
     *
     * Like `embeddings`, and for the same two reasons, it has no entry in
     * `SAMPLING_SCHEMAS`: its one real knob (how much of a passage the
     * extractor is handed) is part of the annotation freshness triple, and an
     * empty vocabulary would defeat core's do-nothing-config guard.
     */
    readonly ner: string;
    readonly tts: string;
    readonly imageGen: string;
};
//# sourceMappingURL=shapes.d.ts.map