# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

People who enjoy or study songs in another language (Spanish, French, Arabic and others). They search for a recording, then read the original lyrics next to a translation, often on a phone and often while the song plays elsewhere. They may be learners using Hide translations as a study aid, or curious listeners who want to know what a line means.

## Product Purpose

Lyrica identifies a recording (song, artist, album, or Apple Music link), fetches its lyrics, and shows original and translated lines aligned in one reader. Success is a reader that stays out of the way: the lines are legible, aligned, copyable, and the user can keep a personal library of songs.

## Positioning

Free, private, and on-device. No accounts, subscription, playback, paid API, or app backend. Translation runs locally (Apple Translation on iPhone; downloadable on-device models in the browser). Lyric storage is opt-in.

## Operating Context

Two surfaces from one repo: a native SwiftUI iPhone app (iOS 18+) and a web PWA (vanilla CSS/JS in `web/`, no build step) hosted free on GitHub Pages. Flows: Search, Reader, Library (favorites and recently viewed), Settings. Web songs have `#song/<id>` URLs. Tests: `tests/web/browser.py`, `tests/web/capture.py`, core and app unit tests, native CI.

## Capabilities and Constraints

- Right-to-left text direction is controlled per cell; original and translation can differ in direction.
- Lyrics are one Tab stop with arrow/J/K navigation; text stays selectable; paired line highlight.
- "Offline" means lyric content is stored; "Favorite" only means the bookmark. Keep these terms distinct.
- Cosmetic changes must not change API behavior, local schemas, cache permission, attribution, or rights explanations.
- Reduced-motion preference must be honored. Touch targets are at least 44px/pt. Dark mode is required.
- Keyboard focus, caret/IME stability while typing, and focus restoration after dialogs must be preserved.

## Brand Commitments

Name "Lyrica". The artwork of the recording supplies identity; the interface does not tint itself to match. Original fictional demo lyrics and the "Donde empieza el día" example ship with included translations.

## Evidence on Hand

Screenshots in `docs/web/screenshots/` (24) and `docs/ios/` (4), `docs/lyrica-walkthrough.mp4`, `docs/UI_AUDIT.md` (heuristic score 26/40, technical 14/20 at the last review). No testimonials, usage data, or store listing exist; do not invent them.

## Product Principles

1. The words come first. Interface chrome never competes with the lyric lines.
2. Private by default: nothing is stored or sent without the user's opt-in, and the UI says so plainly.
3. Every state is recoverable: loading, empty, error, and download states are explicit.
4. One product, two surfaces: iPhone and web share tokens and behavior while respecting each platform's conventions.
5. Motion and softness must serve reading, not interrupt it.

## Accessibility & Inclusion

Dynamic Type and browser text-size settings apply. VoiceOver labels carry each lyric part's language. Contrast tokens from the 2026-11-09 audit (e.g. switch-off at 3:1 or better) must hold in both themes. Reduced motion disables springs and transitions.
