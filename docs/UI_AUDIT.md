# Lyrica UI audit

## 2026-11-09 review: flows, resilience, and study features

**Scope:** web companion and iPhone app, reviewed against real flows (refresh, Back, toggles, favorites, keyboard, storage failure) rather than screenshots alone.
**Direction:** keep the Apple-like system typography, quiet surfaces, and blue controls; fix behavior and drift within that look.

Two independent reviews ran in parallel. A heuristic critique scored the interface **26/40** and a technical audit scored it **14/20**. Both are lower than the earlier visual-only scores because they exercised flows the earlier pass didn’t. They were not re-scored after the fixes; the browser and native test suites below are the evidence for the changes.

| Priority | Finding | Change |
| --- | --- | --- |
| P1 | The web reader had no URL: refresh lost the song, browser Back left the app, nothing could be shared. | `#song/<id>` routes with history entries; refresh restores the song; Back returns to the list position and focus it came from; Share and Copy link. Unsaved numeric IDs are looked up from Apple. |
| P1 | Chrome’s `Translator.availability()` and language detection can hang indefinitely, freezing the paste dialog and the reader (this was also the cause of a failing viewport test). | Both checks time out after three seconds and fall back to the downloadable-model path. Pasted lyrics render immediately. |
| P1 | Lyric rows were buttons, so lyrics couldn’t be selected, copied, or looked up. | Web rows keep their highlight but allow text selection, with a single Tab stop and arrow/J/K movement, plus Ctrl/⌘-C for the focused pair. Native rows use `.textSelection(.enabled)` with tap to highlight. |
| P1 | Turning offline storage off deleted saved lyrics silently; the storage prompt reappeared on every favorite. | Confirmation before deleting (web and native); the offer is made once on the first favorite. |
| P1 | “Saved” meant both favorite and offline copy. | The heart reads **Favorite** (pressed state); the badge reads **Offline** on both platforms. |
| P1 | IndexedDB failure broke the example, Library, and Settings. | In-memory fallback with the same API and a clear notice; failed saves no longer stop reading. |
| P1 | Translation progress replaced the Cancel button, dropping keyboard focus. | Progress updates only the message text; focus moves to the status when a control disappears. |
| P2 | Typing in Search or Library re-rendered the page, jumping the caret and breaking IME. | Only the results region updates; composition is respected. Arrow keys move from the search field into results. |
| P2 | Pinned chrome covered 31–42% of short screens. | Phone reader: header scrolls away and the language bar is one 48px row. Short viewports pin nothing but the tab bar. Native unpins at accessibility sizes. |
| P2 | Fixed stanza gaps merged verses at large text; untranslated rows showed “—”. | Gaps scale with text size; untranslated readers show the original alone; a source-language dead end now offers the picker. Script detection recognises Arabic, Hebrew, Korean, Japanese, Chinese, and Hindi. |
| P2 | Settings nested a panel inside a panel; the dark selected segment was darker than its track; the off switch was 2.54:1. | Grouped page background with one card level; new segment and switch tokens (≥3:1). |
| P2 | Favorites ×-button floated mid-card and deleted more than the favorite. | The card’s filled heart unfavorites, aligned to the title row, with Undo. |
| P2 | The iPhone app’s first run was one sentence in an empty screen; the simulator could never show a translated reader. | Native example song with included translations and matching artwork; screenshots of the reader are now possible. |
| P2 | VoiceOver read lyrics in the device voice. | Native labels carry each part’s language. *Needs confirmation with VoiceOver on a device.* |
| P3 | Plurals (“1 originals”, “1 results”), demo/example drift, nav count, ambiguous “iPhone app” link, 11px caption, px-only type. | Plural helper, “example” throughout, count removed, link renamed, caption removed, interface font sizes in `rem`. |
| New | No study aid, copy, or backup. | Hide translations (web and native), Copy lyrics & translation, library backup export/import (web). |

**Verification:** 27 web unit tests; `browser.py` (13 groups: the 8 existing, including the previously failing viewport matrix, plus 5 new ones for routing, reading controls, storage safety, backup, and resilience), `translation-browser.py`, and `context-browser.py` all pass. Native: 22 core tests and 17 app tests pass, including a new test that the example reads with its included translations without the network or a translation session. Fresh 24-image web matrix in `docs/web/screenshots/`; fresh iPhone 17 simulator captures of Search and the example Reader in `docs/ios/`. Translation downloads, VoiceOver, and device-specific layout still need a physical iPhone.

---

## 2026-10-30 review

**Reviewed:** 2026-10-30  
**Scope:** iPhone SwiftUI app and browser companion  
**Direction:** retain the existing Apple-like system typography, quiet surfaces, blue controls, native behaviors, and content-first bilingual reader.

## Review method

The latest `Kerollosl/codex-skills` revision (`8ee1b6021be08c07675d579898a877e29bfc624a`) was pulled and all 60 active skills were installed locally. The UI Design Lead routed this existing-app refinement through the Impeccable critique/audit/polish workflow and native iOS design guidance. The private skill bundle remains outside this public app repository.

## Findings and changes

The independent visual critique reviewed 54 baseline combinations across phone, tablet, and desktop widths, both themes, and the primary screens. It scored the incumbent interface **29/40** on the ten heuristic categories. That score is the baseline before this cleanup; the same scale was not re-run afterward.

The reader already had a clear product-specific structure: recording artwork and metadata lead into original and translated lines, with each language allowed to use its own reading direction. The remaining issues were mostly small interruptions in that reading flow.

| Priority | Before | Change |
| --- | --- | --- |
| P2 | Language pickers started to the left of their lyric columns, and extra status and heading text reduced room for the lyrics. | Matched picker and lyric column widths and edges; removed the duplicate column heading and redundant demo status; kept one short stacking hint on phone. |
| P2 | Favoriting opened an offline-storage prompt whose dismissal did not say that the bookmark would remain. | Kept the favorite, clarified “Keep bookmark only,” and explained that offline copies require a separate choice. Settings uses “Not now.” |
| P2 | The long offline-storage action could exceed a narrow dialog’s width. | Stacked dialog actions on phone, allowed the primary label to wrap, and checked the 320px layout. |
| P2 | Manual translation did not show the number of lines expected or the source text while editing. | Shows the required nonblank-line count before submission and puts the original in an expandable preview. Validation keeps focus on the text field. |
| P3 | Empty history described favorites, and the search hint was truncated. | Corrected the empty-state copy and shortened the placeholder while keeping the full accessible label. |
| P3 | A settings label wrapped awkwardly at the narrowest supported width; the reader options summary was below the 44px target. | Stacked narrow settings controls and increased the summary target to 44px. |
| P3 | Removing a library record did not identify all the data being removed. | Added a confirmation that describes removal of the bookmark, lyrics, and translations; improved the control’s accessible name. |

No task-blocking P0 or major P1 issue was found. The changed screens were reviewed together after the fixes; no additional visual correction was needed.

## Technical review

The web review covered accessibility, loading and error recovery, performance, theming, responsive behavior, and implementation integrity. Scores use a 0–4 scale, where 4 is strongest.

| Dimension | Score | Evidence and remaining limit |
| --- | ---: | --- |
| Accessibility | 3/4 | Native buttons and labels, visible focus, skip navigation, keyboard flows, error focus, RTL language direction, reduced-motion behavior, and 44px touch controls are present. VoiceOver and other screen readers still need device testing. |
| Performance | 4/4 | No custom web font or heavy visual effect; artwork declares dimensions and loads lazily; browser storage and service-worker scope stay local. |
| Theming | 4/4 | Semantic color tokens cover light, dark, and system themes. Browser theme chrome follows explicit and system appearance changes. |
| Responsive design | 4/4 | Browser flows and captures cover 390, 768, and 1440px; overflow is checked at each width, with a separate 320px permission-dialog check. |
| Implementation integrity | 3/4 | Product-specific layout and authored demo content remain coherent. The final static anti-pattern scan had to use regex fallback because the optional HTML/CSS parser modules were unavailable; its empty result is not treated as proof of a clean scan. |
| **Total** | **18/20** | **Excellent range, with the stated screen-reader and detector limits.** |

## Verification

- The final browser suite passed the search, API error, manual lyrics, storage permission, library, keyboard, translation, RTL, focus restoration, theme, forced-colors, responsive, and offline-shell flows. It uses authored test material, not commercial lyrics.
- Nine web core tests passed for lyric parsing, song URL handling, metadata matching, translation alignment, and local storage rules.
- A fresh matrix of 24 real application screenshots was captured at 390, 768, and 1440px in light and dark appearance. The matrix and representative images are in [`docs/web/screenshots/`](web/screenshots/).
- Native code now uses stable lyric-row identity so language changes preserve the selected line and source edits clear obsolete highlights. Library removal asks before deleting stored lyrics and translations. Four focused unit tests cover the row identity behavior. The [latest native GitHub run](https://github.com/Kerollosl/lyrica/actions/runs/41092689556) passed both builds, 22 core tests, and 15 native tests.
- The optional native screenshot export timed out at simulator launch, including after removing the redundant reinstall. Because the workflow marks that optional step `continue-on-error`, the run itself is green; it did not produce screenshot artifacts. The older `docs/ios/` Search captures are not presented as current. Translation model downloads, VoiceOver, and device-specific layout still require a physical iPhone.

## Design rules retained

Use platform system typography and standard native controls. Keep the reader’s original and translation aligned, give each text its own language direction, and let text wrap without independent column scrolling. Keep cache permission separate from favorites, say what destructive actions remove, and keep lyrics rights and attribution visible where they matter. Avoid decorative shading, oversized promotional type, custom fonts, and extra status labels that push the lyrics down.
