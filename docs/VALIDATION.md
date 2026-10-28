# Modern UI verification

Verified implementation and captures on 2026-10-28. The UI changes preserve the existing storage schemas, opt-in cache permissions, source services, and translation providers.

## Automated results

- [Native workflow passed](https://github.com/Kerollosl/lyrica/actions/runs/40746794585): device build, simulator build, 22 core tests and 11 native persistence/view-model tests. Native UI source is unchanged since tested commit `5aac038`.
- [Final web workflow passed](https://github.com/Kerollosl/lyrica/actions/runs/40747387859): 9 domain tests plus the complete deterministic browser suite on web implementation commit `bfb9f33`.
- Web browser checks include search/lyrics retrieval, debouncing cancellation, keyboard skip and search shortcut, paired highlights, reader disclosure controls, font-size changes, stacked layout, cached language switching, Arabic RTL, permitted-cache opt-in, metadata-only favorites, persistence, manual line alignment, edited-lyrics invalidation, cache clearing, individual removal and complete deletion.
- Loading, no-results, rate-limit, unavailable lyrics, and network retry flows use original fixture text. No commercial lyrics are stored in test fixtures.
- Responsive matrix: 390, 768, and 1440px, light/dark themes, all primary screens, largest text, long authored lines and unbroken tokens, Arabic, favorites and empty libraries. No horizontal overflow or page errors. Long title/artist/album wrapping was also checked at all three widths.
- Offline verification: service-worker application shell and the original bilingual demo reopen without a connection. The cache includes the locally hosted font and SVG icon module; external API responses are excluded.

## Runtime media

- `docs/web/screenshots/` contains 24 real browser captures and a capture manifest. The scenes use only Lyrica's original demo material and actual local save flows. Mobile captures show the viewport and fixed navigation.
- `docs/ios/` contains real light/dark iPhone Search simulator captures from the successful native workflow.
- `docs/lyrica-walkthrough.mp4` is a roughly 62-second H.264 browser recording, with captions, no audio, and included example translations. It does not demonstrate a live translation-model download.
- `scripts/record_web_walkthrough.py` and `tests/web/capture.py` reproduce the web media with a local server running.

## Remaining device checks

Apple Translation consent/model downloads, actual translation quality, the pinned native language toolbar on physical devices, VoiceOver, and device-specific behavior still need the physical-iPhone acceptance checklist. Browser Translator API downloads and hardware-specific support likewise require a compatible real browser/device. Passing simulated UI and persistence tests does not establish those capabilities.
