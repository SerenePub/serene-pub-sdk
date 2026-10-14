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
import { getContext, setContext } from "svelte"
import { SvelteSet } from "svelte/reactivity"
import { useWidgetContext } from "../context"
import type { WidgetContextRef } from "@serene-pub/core-catalog/conversation"
import {
	NO_LINE,
	type ConversationDossierV1,
	type ConversationLineV1
} from "@serene-pub/core-catalog/conversation"
import type { WidgetRequestKind, WidgetRequests } from "@serene-pub/sdk/component"
import { canAnswerForm } from "@serene-pub/core-catalog/conversation"
import { setStatusTextResolver, statusTextIn } from "@serene-pub/core-catalog/conversation"
import type { RequestDeclineCode, StatusText } from "@serene-pub/sdk/component"
import { boundaryOffer, laneOf, markedRun, type BoundaryOffer, type SceneMarkRow } from "./sceneMarks"

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
	 * The channels this copy shows (lair re-plan S1): its composer's, which
	 * the host narrows per mount — a copy pinned to the Sanctum is told
	 * `['sanctum']`, the primary log the channels no pinned copy claims.
	 * `null` (no dossier yet, or an empty list) is every channel.
	 */
	const channels = $derived.by((): string[] | null => {
		const listed = dossier?.composer?.channels
		return listed && listed.length ? listed : null
	})
	/** A row's channel slug: `main` when unset, a lane's slug for `slug:n`. */
	const slugOf = (channel: unknown) =>
		(typeof channel === "string" && channel ? channel : "main").split(":")[0]
	/**
	 * The rows this log holds: the host's log narrowed to this copy's
	 * channels. A row on a channel another copy claims is not drawn here at
	 * all (never merely hidden), so two copies never hold the same line.
	 */
	const rows = $derived.by(() => {
		const all = ctx().messages.v1
		if (!channels) return all
		const shown = new Set(channels)
		return all.filter((m) => shown.has(slugOf((m as { channel?: unknown }).channel)))
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
				return channels && !channels.includes(lane) ? channels[0] : lane
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
