# Lyrica UI audit

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
- Native code now uses stable lyric-row identity so language changes preserve the selected line and source edits clear obsolete highlights. Library removal asks before deleting stored lyrics and translations. Four focused unit tests cover the row identity behavior.
- Native build and simulator tests require macOS/Xcode and run in [GitHub Actions](https://github.com/Kerollosl/lyrica/actions). They cannot run in this Linux workspace. Translation model downloads, VoiceOver, and device-specific layout still require a physical iPhone.

## Design rules retained

Use platform system typography and standard native controls. Keep the reader’s original and translation aligned, give each text its own language direction, and let text wrap without independent column scrolling. Keep cache permission separate from favorites, say what destructive actions remove, and keep lyrics rights and attribution visible where they matter. Avoid decorative shading, oversized promotional type, custom fonts, and extra status labels that push the lyrics down.
