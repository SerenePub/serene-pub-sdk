/**
 * `@serene-pub/core-catalog/conversation` — the plain-TypeScript half of
 * core's conversation widget (C7): the dossier its host projects, and the
 * verdicts, ordering and text the widget draws from. The widget's Svelte
 * source lives in `components/shared/messages/` and ships built
 * (`dist/components/messages.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * 🚧 Provisional with the dossier: a plugin is granted none of it, and
 * nothing here is part of the modder surface.
 */
export * from './dossier.js'
export * from './formAnswer.js'
export * from './itemValues.js'
export * from './messageOrder.js'
export * from './messageSpeaker.js'
export * from './messageVerbState.js'
export * from './slashPalette.js'
export * from './text.js'
// The context alone, as this subpath always carried it: the section table
// and its shapes are the neutral `…/widgets` subpath's.
export { WIDGET_CONTEXT_KEY, type WidgetContext, type WidgetContextRef } from '../widgetContext.js'
export * from './composerTray.js'
// 🚧 §15 G9: the conversation's dates, through the book's calendar.
export * from './storyDays.js'
// 🚧 Channel lanes in a copy's channel list: the explicit lane, the no-lane marker.
export * from './channelLanes.js'
// 🚧 Channel tabs (lair fix 2): a copy showing two or more channels draws a tab each, with a dot for news.
export * from './channelTabs.js'
// 🚧 The table channel (PLAN-rulesets §30): rolls and calculations, off the story.
export * from './tableChannel.js'
// 🚧 A dice line (Lair rewrite D3): a roll form, a dice result, or a roll form's answer.
export * from './diceLine.js'
// 🚧 Back · Forward (RF fix 5): the presses' state (the host's header draws them) and the composer's note while rewound.
export * from './rewindStrip.js'
// 🚧 Composer states (owner ruling 2026-10-15): a closed composer's lane and
// what it says — the SDK's own readers, for the composer to import here.
export {
	COMPOSER_CLOSED_NO_REASON,
	composerClosedOn,
	composerClosedPlaceholder,
} from '@serene-pub/sdk'
