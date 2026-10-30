# UI verification

Validated on **2026-10-30**. The review preserved the existing service APIs, local storage schemas, opt-in lyric caching, and translation providers. See the [UI audit](UI_AUDIT.md) for the findings and scoring.

## Current verification

- The web core suite passed locally: **9 tests** covering lyric parsing, Apple Music URLs, recording matching, translation alignment, and local storage permission.
- The complete Playwright browser suite passed against the edited web app. It includes search and lyric failure states, manual lyrics, line alignment, language switching, RTL, storage, draft protection, focus restoration, theme changes, keyboard behavior, 320px dialog layout, 390/768/1440px layout checks, and offline shell behavior.
- A fresh matrix of **24 actual app screenshots** was captured at 390, 768, and 1440px in light and dark themes. No commercial lyrics or mocked live translations are used.
- The Impeccable static detector reported no matches in the changed web files, but it warned that optional HTML/CSS parser modules were unavailable and used regex fallback. Treat that result as limited evidence, not as a clean full scan.
- The local workspace is Linux without `xcodebuild` or Swift. Native build and XCTest verification therefore run on GitHub macOS CI. The new native reader/library implementation was pushed in commit `680b784`; its [iOS workflow](https://github.com/Kerollosl/lyrica/actions/runs/41090447955) was queued when this report was written.

## Previous CI baseline

- [Native build and tests](https://github.com/Kerollosl/lyrica/actions/runs/40804011446) passed before this audit’s native changes: device and simulator builds, 22 core tests, and 11 persistence/view-model tests.
- [Web checks](https://github.com/Kerollosl/lyrica/actions/runs/40803523842) passed before this audit’s web changes: 9 core tests and the then-current browser suite.

## Runtime media

- `docs/web/screenshots/` contains the updated 24-image matrix and capture manifest. Preview images in `docs/web/` are taken from the same app runs.
- `docs/lyrica-walkthrough.mp4` is a **76.6-second, 1280×900 H.264** recording of the phone and desktop app. It has captions, no audio, and only original fictional demo lyrics and included examples. It does not claim to demonstrate a translation-model download.
- `scripts/record_web_walkthrough.py` records the two viewport sizes with fresh browser sessions. `tests/web/capture.py` reproduces the screenshot matrix.

## Remaining device checks

Apple Translation model consent and downloads, translation quality, VoiceOver, and device-specific layout require a physical iPhone. The browser Translator API also varies by browser, hardware, and language pair. Passing the automated browser suite does not establish those capabilities.
