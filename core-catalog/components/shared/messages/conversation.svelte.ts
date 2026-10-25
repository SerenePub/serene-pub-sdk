/**
 * The conversation widget's own model (C0b): what its parts read, derived
 * from the widget context alone, and what they do, through its verbs alone.
 *
 * `MessagesWidget` creates one and provides it; the log, each message, its
 * controls and the composer read it (`useConversation`) instead of taking the
 * page's callbacks as props. So the widget's state — which line is being
 * edited, whose menu is open, what is selected for a summary — is the
 * widget's, and every effect is an `invoke` (core's verbs, a contributed
 * action) or a `request` (something the host opens). Nothing here imports a
 * store, the socket or the page: the same source runs in a UI worker.
 */
import { getContext, setContext, untrack } from "svelte"
import { SvelteMap, SvelteSet } from "svelte/reactivity"
import { useWidgetContext } from "../context"
import type { WidgetContextRef } from "@serene-pub/core-catalog/conversation"
import {
	NO_LINE,
	type ConversationDossierV1,
	type ConversationLineV1
} from "@serene-pub/core-catalog/conversation"
import type { WidgetRequestKind, WidgetRequests } from "@serene-pub/sdk/component"
import { canAnswerForm } from "@serene-pub/core-catalog/conversation"
import {
	canonicalListedChannel,
	isNoLaneChannel,
	rowOnListedChannels
} from "@serene-pub/core-catalog/conversation"
import { setStatusTextResolver, statusTextIn } from "@serene-pub/core-catalog/conversation"
import type { RequestDeclineCode, StatusText } from "@serene-pub/sdk/component"
import { boundaryOffer, laneOf, markedRun, type BoundaryOffer, type SceneMarkRow } from "./sceneMarks"
import { interleaveByAnchor, interleaveMode, interleaveSlug, isInterleavedRow, rowKindOf, rowKindsOf, rowsByKind } from "./interleave"

const KEY = Symbol("sp-conversation")

export type Conversation = ReturnType<typeof createConversation>

/** What a verb's subject is: a message, by id. */
type Subject = { id: number }

/**
 * 🚧 Where a scene write was asked, so its refusal is said there: under a
 * line, in a scene's divider, in the selection bar, or in a scene cue's chip
 * (lane E).
 */
type SceneAsk = "line" | "scene" | "selection" | "cue"

/**
 * A request declined because the view went away — the page's decline of what
 * it never answered, or the wire's own at `close()`. Expected at every
 * unmount with a request in flight (the composer's `draft` is nearly always
 * one), so it is not a failure worth a line on stderr. Read by its
 * `code` (`unmounted`, a {@link RequestDeclineCode}); an older host declines
 * with its sentence alone ("the page was unmounted before it answered"), so
 * the text is the fallback.
 */
export function isUnmountDecline(e: unknown): boolean {
	const code: unknown = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined
	if (code !== undefined) return code === ("unmounted" satisfies RequestDeclineCode)
	const message = e instanceof Error ? e.message : String(e)
	return /\bunmounted\b/.test(message)
}

export function createConversation(widget: WidgetContextRef) {
	const ctx = () => widget.current
	const warn = (what: string) => (e: unknown) => {
		if (isUnmountDecline(e)) return
		console.warn(`conversation: ${what} — ${e instanceof Error ? e.message : String(e)}`)
	}

	let editingId = $state<number | null>(null)
	/**
	 * 🚧 The last scene boundary the host refused, said where it was asked:
	 * under a line (*Start scene here*, *End scene here*), in a scene's
	 * divider, or in the selection bar (*Mark as scene*). One at a time.
	 */
	let sceneRefusal = $state<{ at: SceneAsk; id: number; text: string } | null>(null)
	/** A scene boundary is being written: its presses wait. */
	let sceneBusy = $state(false)
	let menuFor = $state<number | undefined>(undefined)
	let selecting = $state(false)
	/** The lane the composer writes to, and the log shows (`main` by default). */
	let lane = $state("main")
	const selected = new SvelteSet<number>()

	// Status sentences in this widget's language (`text.ts`).
	setStatusTextResolver(
		() => ctx().locale.v1,
		(source) => ctx().t(source)
	)

	// Through the context's own type — its scoped keys come from the SDK's
	// one table — so a renamed section fails to compile here.
	const dossier = $derived((ctx().scope("session:full") ?? null) as ConversationDossierV1 | null)

	/**
	 * 🚧 The channel this copy draws inline (`interleave`, PLAN-rulesets §30):
	 * its rows sit straight after the line each is anchored to
	 * (`metadata.anchorMessageId`), faceless. `''`: none.
	 */
	const interleave = $derived(
		interleaveSlug((ctx().settings?.v1 as { interleave?: unknown } | undefined)?.interleave)
	)
	/** 🚧 How an interleaved row reads (`interleaveAs`, §16): a fold, closed by default, or open. */
	const interleaveAs = $derived(
		interleaveMode((ctx().settings?.v1 as { interleaveAs?: unknown } | undefined)?.interleaveAs)
	)
	/** 🚧 Which kinds of a folio's lines this copy draws (`rowKinds`, §16); none is every line. */
	const rowKinds = $derived(rowKindsOf((ctx().settings?.v1 as { rowKinds?: unknown } | undefined)?.rowKinds))
	/**
	 * The channels this copy shows (lair re-plan S1): its composer's, which
	 * the host narrows per mount — a copy pinned to the Sanctum is told
	 * `['sanctum']`, the primary log the channels no pinned copy claims.
	 * `null` (no dossier yet, or an empty list) is every channel.
	 */
	const channels = $derived.by((): string[] | null => {
		const listed = dossier?.composer?.channels
		if (!listed || !listed.length) return null
		// 🚧 The interleaved channel is drawn under its anchors, never a
		// lane of this copy's own: its composer never writes there and its
		// strip never offers it — unless it is all the copy shows.
		const own = interleave ? listed.filter((c) => c !== interleave) : listed
		return own.length ? own : listed
	})
	/**
	 * 🚧 The viewer is in no lane of the channel this copy claims (its
	 * `channelLaneFrom` found none): the copy shows nothing and writes
	 * nowhere. A display claim — who may read a lane is the genre's to keep.
	 */
	const noLane = $derived(!!channels && channels.every(isNoLaneChannel))
	/**
	 * The rows this log holds: the host's log narrowed to this copy's
	 * channels — a bare slug holds every lane of its channel, a listed lane
	 * (`parley:2`) that lane alone (`rowOnListedChannels`). A row on a channel
	 * another copy claims is not drawn here at all (never merely hidden), so
	 * two copies never hold the same line.
	 */
	const rows = $derived.by(() => {
		const all = ctx().messages.v1
		const listed = channels
		const mine = listed
			? all.filter(
					(m) =>
						rowOnListedChannels(listed, (m as { channel?: unknown }).channel) ||
						isInterleavedRow(m as { id: number; channel?: unknown }, interleave)
				)
			: all
		const anchored = interleave ? interleaveByAnchor(mine, interleave) : mine
		// 🚧 A journal's kinds (§16): the named ones, a round under its `did` line.
		return rowsByKind(anchored as Array<(typeof anchored)[number] & { metadata?: unknown }>, rowKinds)
	})

	// The host's summary finished: the selection it was handed ends.
	let summaryEnded: number | null = null
	$effect(() => {
		const n = dossier?.summaryEnded ?? 0
		if (summaryEnded !== null && n !== summaryEnded) {
			selecting = false
			selected.clear()
		}
		summaryEnded = n
	})

	/**
	 * How long each run took, as this view saw it: `generation:start` to
	 * `generation:end`, per reply. A run that finished before the page opened
	 * has none, and a stopped run keeps none. Read by the newest reply's ⋮
	 * menu (`MessageControls`), which says *Replied · 6.2 s* — the turn line's
	 * pill said it at rest until polish parity L1 (2026-10-24).
	 */
	const runStartedAt = new Map<number, number>()
	const runTook = new SvelteMap<number, number>()
	$effect(() =>
		untrack(() => {
			const offStart = ctx().on("generation:start", (e) => {
				if (e.kind === "generation:start" && e.messageId != null) runStartedAt.set(e.messageId, Date.now())
			})
			const offEnd = ctx().on("generation:end", (e) => {
				if (e.kind !== "generation:end" || e.messageId == null) return
				const t0 = runStartedAt.get(e.messageId)
				runStartedAt.delete(e.messageId)
				if (t0 === undefined || e.aborted) runTook.delete(e.messageId)
				else runTook.set(e.messageId, (Date.now() - t0) / 1000)
			})
			return () => {
				offStart()
				offEnd()
			}
		})
	)

	/** `text`: what the press supplies — the composer's slash argument (S2). */
	function invoke(key: string, subject?: Subject, payload?: Record<string, unknown>, text?: string) {
		try {
			ctx().invoke(key, { messageId: subject?.id, payload, ...(text !== undefined ? { text } : {}) })
		} catch (e) {
			warn(key)(e)
		}
	}

	function request<K extends WidgetRequestKind>(kind: K, params: WidgetRequests[K]["params"]) {
		return ctx().request(kind, params).catch(warn(kind))
	}

	/**
	 * 🚧 One scene write (`scene-*`, a scene's `summarize`): its refusal is
	 * said where it was asked (`sceneRefusal`), never dropped on stderr —
	 * a view going away is no refusal. Resolves with the answer, or null.
	 */
	async function sceneWrite<K extends WidgetRequestKind>(
		where: { at: SceneAsk; id: number },
		kind: K,
		params: WidgetRequests[K]["params"]
	): Promise<WidgetRequests[K]["result"] | null> {
		sceneRefusal = null
		try {
			return await ctx().request(kind, params)
		} catch (e) {
			if (!isUnmountDecline(e))
				sceneRefusal = { ...where, text: e instanceof Error ? e.message : String(e) }
			return null
		}
	}

	return {
		get ctx() {
			return ctx()
		},
		get dossier() {
			return dossier
		},
		/** The page's word on one line; nothing when it has none. */
		line(id: number): ConversationLineV1 {
			return dossier?.lines[id] ?? NO_LINE
		},
		t: (source: string) => ctx().t(source),
		/** How long the run that wrote this reply took, in seconds, as this view saw it; undefined when it did not see it. */
		runTook: (messageId: number): number | undefined => runTook.get(messageId),
		/** A status sentence in the viewer's language. */
		statusText: (status: StatusText | null | undefined) =>
			statusTextIn(status, ctx().locale.v1, (source) => ctx().t(source)),

		/** May the viewer answer a form put to `addressee`? */
		canAnswer(addressee: string | undefined) {
			const f = dossier
			return canAnswerForm(
				addressee,
				{ userId: ctx().viewer.v1.userId, isOwner: !!f?.isOwner, isAdmin: ctx().viewer.v1.isAdmin },
				f?.cast
			)
		},

		// ── verbs ────────────────────────────────────────────────────────────
		invoke,
		/** A reply swiped: to the newer alternative (right) or the older (left). */
		swipe(subject: Subject, direction: "left" | "right") {
			invoke("swipe", subject, { direction })
		},
		request,

		// ── 🚧 Back · Forward (RF fix 5): the session's forward stack ───────
		rewind: {
			/** The host's word (`SessionDossierV1.rewind`); null from a host that sends none. */
			get state() {
				return dossier?.rewind ?? null
			},
			/** Back: the newest turn out of the history. The host refuses in words. */
			back() {
				void request("rewind-turn", {})
			},
			/** Forward: the newest rewound turn back into it. */
			forward() {
				void request("forward-turn", {})
			}
		},

		/** 🚧 The session's settle line (`SessionDossierV1.settledThrough`): the newest settled message id; null when none or from a host that sends none. */
		get settledThrough(): number | null {
			return typeof dossier?.settledThrough === 'number' ? dossier.settledThrough : null
		},

		// ── editing: the widget's own state; saving is the `edit` verb ───────
		edit: {
			get id() {
				return editingId
			},
			start(subject: Subject) {
				editingId = subject.id
				menuFor = undefined
			},
			cancel() {
				editingId = null
			},
			save(subject: Subject, content: string) {
				invoke("edit", subject, { content })
				editingId = null
			}
		},

		/** The rows this copy's log holds — its channels' (S1), in the host's order. */
		get rows() {
			return rows
		},
		/** The channels this copy shows, or `null` for every channel. */
		get channels() {
			return channels
		},
		/**
		 * 🚧 Older lines remain for THIS copy (owner ruling ★7): one of its
		 * channels — or the channel it interleaves — is among the dossier's
		 * `olderIn`; a host that predates it answers with `hasOlder`.
		 */
		get hasOlder(): boolean {
			const olderIn = dossier?.olderIn
			if (!Array.isArray(olderIn)) return !!dossier?.hasOlder
			if (!channels) return olderIn.length > 0
			const mine = interleave ? [...channels, interleave] : channels
			return olderIn.some((c) => rowOnListedChannels(mine, c))
		},
		/** 🚧 Ask for the next older page of this copy's own channels (`load-older`, ★7). */
		loadOlder(): void {
			const mine = channels ? (interleave ? [...channels, interleave] : [...channels]) : null
			void request("load-older", mine ? { channels: mine } : {})
		},
		/** 🚧 The channel this copy draws inline under its anchors, or `''`. */
		get interleave() {
			return interleave
		},
		/** 🚧 Whether `row` is drawn inline from the interleaved channel. */
		isInterleaved(row: { id: number; channel?: unknown }): boolean {
			return isInterleavedRow(row, interleave)
		},
		/** 🚧 How an interleaved row reads: `fold` (the default) or `open`. */
		get interleaveAs() {
			return interleaveAs
		},
		/** 🚧 A row's kind (`metadata.kind`), or `null` — a journal's `did`, `found`, `met`… */
		rowKind(row: { metadata?: unknown }): string | null {
			return rowKindOf(row)
		},
		/** 🚧 The viewer is in no lane of this copy's claimed channel: nothing to show or write. */
		get noLane() {
			return noLane
		},
		/**
		 * What a channel is CALLED: its declared label in the viewer's language
		 * (`ChannelDecl.label`, the Lair's _Sanctum_), else its slug, title-cased
		 * (`manuscript` reads _Manuscript_).
		 */
		channelName(slug: string): string {
			const label = dossier?.composer?.channelLabels?.[slug]
			if (label) return label
			return slug
				.split(/[-_]/)
				.filter(Boolean)
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(" ")
		},
		/**
		 * What a channel IS (`ChannelDecl.role`, PLAN-core-widgets §3.7):
		 * `folio` for a manuscript-style channel, else `conversation` — the
		 * default every channel has, and the answer while the host says
		 * nothing (`composer.channelRoles` absent).
		 */
		channelRole(slug: string): "conversation" | "folio" {
			return dossier?.composer?.channelRoles?.[slug] === "folio"
				? "folio"
				: "conversation"
		},

		/**
		 * The lane the composer writes to; the log shows that lane's rows. It is
		 * always one of this copy's channels: a copy told one channel writes on
		 * it whatever was chosen before (S1).
		 */
		lane: {
			get current() {
				if (!channels) return lane
				// A listed lane is written and compared in its canonical form
				// (`parley:1` is the row stored `parley`); the no-lane marker is
				// never a lane to write on while a real channel is listed.
				const writable = channels.filter((c) => !isNoLaneChannel(c))
				if (!writable.length) return channels[0]!
				const pick = writable.includes(lane) ? lane : writable[0]!
				return canonicalListedChannel(pick)
			},
			set(next: string) {
				lane = next || "main"
			}
		},

		/** Whose ⋮ menu is open — one at a time across the log. */
		menu: {
			get open() {
				return menuFor
			},
			set(id: number | undefined) {
				menuFor = id
			}
		},

		// ── 🚧 live scenes: the boundaries a person places (§7, §14 C) ─────
		scenes: {
			/** The viewer may place scene boundaries here (the dossier's verdict). */
			get boundaries() {
				return !!dossier?.sceneBoundaries
			},
			/** The last refusal, and where it is said. */
			get refusal() {
				return sceneRefusal
			},
			dismiss() {
				sceneRefusal = null
			},
			/** A boundary write is in flight. */
			get busy() {
				return sceneBusy
			},
			/**
			 * 🚧 A scene's summary may be asked for here — not when the
			 * session's summaries are off (`sceneSummaryMode: 'never'`).
			 */
			get summarizes() {
				return dossier?.sceneSummaryMode !== "never"
			},
			/**
			 * 🚧 The scene cues waiting at lines — Suggested mode's *New
			 * scene?* chips (lane E) — only where the viewer may place a
			 * boundary.
			 */
			get cues() {
				return dossier?.sceneBoundaries ? (dossier.sceneCues ?? []) : []
			},
			/** Which boundaries this line's menu offers (none without the verdict). */
			offer(row: SceneMarkRow): BoundaryOffer {
				if (!dossier?.sceneBoundaries) return { start: false, end: null }
				return boundaryOffer(row, dossier.scenes ?? [])
			},
			/** *Start scene here*: a scene opens at this line, on its lane. */
			async startAt(row: SceneMarkRow) {
				if (sceneBusy) return
				sceneBusy = true
				try {
					await sceneWrite({ at: "line", id: row.id }, "scene-open", {
						messageId: row.id,
						channel: laneOf(row.channel)
					})
				} finally {
					sceneBusy = false
				}
			},
			/** *End scene here* (a line), or *End scene* (its divider: at the lane's newest line). */
			async endAt(sceneId: number, row?: SceneMarkRow) {
				if (sceneBusy) return
				sceneBusy = true
				try {
					await sceneWrite(
						row ? { at: "line", id: row.id } : { at: "scene", id: sceneId },
						"scene-close",
						row ? { sceneId, messageId: row.id } : { sceneId }
					)
				} finally {
					sceneBusy = false
				}
			},
			/**
			 * 🚧 Move where a live scene starts — a divider dragged between
			 * lines, or its menu's *Move start up/down one line* (lane E).
			 */
			async moveStart(sceneId: number, openedAt: number) {
				if (sceneBusy) return
				sceneBusy = true
				try {
					await sceneWrite({ at: "scene", id: sceneId }, "scene-move", { sceneId, openedAt })
				} finally {
					sceneBusy = false
				}
			},
			/** 🚧 *Reopen scene*: a closed scene runs on to its lane's newest line again (lane E). */
			async reopen(sceneId: number) {
				if (sceneBusy) return
				sceneBusy = true
				try {
					await sceneWrite({ at: "scene", id: sceneId }, "scene-move", { sceneId, closedAt: null })
				} finally {
					sceneBusy = false
				}
			},
			/** 🚧 A scene cue's **Yes** (a scene opens at its line) or **Not here** (lane E). */
			async decideCue(cueId: number, accept: boolean) {
				if (sceneBusy) return
				sceneBusy = true
				try {
					await sceneWrite({ at: "cue", id: cueId }, "decide-scene-cue", { cueId, accept })
				} finally {
					sceneBusy = false
				}
			},
			/** A divider's name, renamed; whether the host took it. */
			async rename(sceneId: number, name: string | null) {
				const done = await sceneWrite({ at: "scene", id: sceneId }, "scene-rename", { sceneId, name })
				return done !== null
			},
			/** *Remove boundary*: the host asks the person, then removes the scene. */
			async remove(sceneId: number) {
				if (sceneBusy) return
				sceneBusy = true
				try {
					await sceneWrite({ at: "scene", id: sceneId }, "scene-remove", { sceneId })
				} finally {
					sceneBusy = false
				}
			},
			/** *Summarize* a scene in the host's review. */
			summarize(sceneId: number) {
				void sceneWrite({ at: "scene", id: sceneId }, "summarize", { kind: "scene", sceneId })
			},
			/**
			 * *Mark as scene* (the selection bar's boundary path): the picked run
			 * becomes one closed live scene — opened at its first line and
			 * closed at its last on that lane, in ONE write (`closeAt`, lane E),
			 * so any run that overlaps no scene can be marked, an earlier one
			 * included — and the selection ends. A refusal keeps it.
			 */
			async markSelection() {
				const run = markedRun(selected, rows as SceneMarkRow[])
				if (!run || sceneBusy) return
				sceneBusy = true
				try {
					const opened = await sceneWrite({ at: "selection", id: run.first }, "scene-open", {
						messageId: run.first,
						channel: run.lane,
						closeAt: run.last
					})
					if (!opened) return
					selecting = false
					selected.clear()
				} finally {
					sceneBusy = false
				}
			}
		},

		// ── selecting lines for a summary ────────────────────────────────────
		select: {
			get active() {
				return selecting
			},
			get ids() {
				return selected
			},
			start(subject?: Subject) {
				selecting = true
				selected.clear()
				if (subject) selected.add(subject.id)
				menuFor = undefined
			},
			stop() {
				selecting = false
				selected.clear()
			},
			toggle(subject: Subject) {
				// A line a scene already captured cannot join another.
				if (dossier?.scened.includes(subject.id)) return
				if (selected.has(subject.id)) selected.delete(subject.id)
				else selected.add(subject.id)
			},
			set(ids: number[]) {
				selected.clear()
				for (const id of ids) selected.add(id)
			},
			/**
			 * From a line toward one end, up to the nearest line already
			 * selected — never through a line a scene has already captured.
			 */
			range(index: number, toward: "above" | "below") {
				// The log's own rows: `index` counts the lines this copy draws.
				const list = rows
				const taken = new Set(dossier?.scened ?? [])
				const step = toward === "above" ? -1 : 1
				for (let i = index; i >= 0 && i < list.length; i += step) {
					const id = list[i].id
					if (taken.has(id)) break
					if (selected.has(id) && i !== index) break
					selected.add(id)
				}
			},
			/**
			 * Hand the selection to the host's summarizer. It stays until the host
			 * says the summary finished (`summaryEnded`): a cancelled or failed
			 * create keeps a hand-picked selection.
			 */
			commit(kind: "scene" | "world" | "character") {
				ctx().request("summarize", { kind, messageIds: [...selected] }).catch(warn("summarize"))
			}
		}
	}
}

export function setConversation(c: Conversation): Conversation {
	return setContext(KEY, c)
}

export function useConversation(): Conversation {
	const c = getContext<Conversation | undefined>(KEY)
	if (!c) throw new Error("a conversation part rendered outside MessagesWidget")
	return c
}

/**
 * The widget's `t` for a part that may also render outside a widget (a
 * block view in a test): the English source there.
 */
export function useT(): (source: string) => string {
	const w = useWidgetContext()
	return (source) => w?.current.t?.(source) ?? source
}
