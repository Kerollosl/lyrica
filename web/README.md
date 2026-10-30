# Lyrica Web

A complete static browser companion to the native iPhone app. No build, npm install, backend, authentication, API keys, or paid translation service is required.

## Run locally

From the repository root:

```sh
python3 -m http.server 4173 --directory web
```

Open **http://localhost:4173**. Alternatively, `cd web && npm run dev`. Use HTTP/HTTPS, not `file://`, because modules, IndexedDB, and service workers require an appropriate origin. Localhost is a secure context for supported browser APIs.

Click **Open example** to immediately test the aligned reader, Arabic RTL, line highlighting, font size, layout switching, and language selection in any modern browser. The demo is original fictional material with included example translations, clearly labeled in the interface. It is not a live translation result or commercial song.

For real music, search by song/artist/album or paste an Apple Music song URL. Select the recording, retrieve its LRCLIB lyrics, and choose a target language. Paste original lyrics when unavailable. The iTunes storefront defaults to US for text search and respects the URL storefront for links.

## Translation differences from iOS

The web app automatically translates **Spanish → English, Arabic → English, and French → English** on device. It prefers a previously downloaded local model; otherwise it uses the browser's built-in Translator API if the pair is supported. Safari and other browsers without that API use quantized OPUS-MT models in a dedicated WebAssembly worker. Apple Translation remains exclusive to the native app.

Choose the original language if automatic browser language detection is unavailable. On the first use of a language, select **Download & translate** after reviewing the download size. Each language needs approximately 110–120 MB of model/tokenizer files, plus a shared 23 MB runtime. Only the requested language is downloaded. Models are fetched from Hugging Face at pinned revisions; lyric text never leaves the device for translation. The engine is vendored with its notices, so runtime code is not imported from a third-party CDN.

Rows appear progressively. Blank verses and row indices remain aligned; repeated lines reuse a result. Long rows are split for inference and rejoined into their original row. Cancellation terminates the worker, including an active model download. Only one language model is retained in memory. Changing languages releases the old worker.

Browser storage reuses downloaded models and the runtime; after a successful download they can work offline while storage is retained. Browser eviction, private mode, quota, and device memory limits can affect this. **Remove downloaded language models** in Settings removes both models and the shared runtime, keeping permitted saved translations. Lyric storage remains separately opt-in. Other language pairs can still use supported browser translation or pasted translations.

This is automatic, progressive translation rather than a guarantee of instant completion. Real OPUS-MT inference, model caching, offline reload, and deletion were verified in Linux Chromium with a phone-size viewport. **Actual iPhone Safari performance, memory limits, and embedded ChatGPT browser behavior remain unverified.** If an embedded browser cannot run the worker, open the Site directly in Safari. See [model details and verification](../docs/WEB_TRANSLATION.md).

Manual translations require one translated line per nonblank original line. Verse breaks are restored automatically. Changing original lyrics invalidates previous translations. Cached languages switch immediately without contacting a translation service.

## Storage and offline reading

IndexedDB stores metadata bookmarks, favorites, recent searches, and preferences on this browser. Original lyrics and translations are saved only after permitted-cache opt-in. Turning caching off clears existing content, retaining metadata. The app shell is cached by a service worker after the first online visit; API responses are never cached by the service worker, and API fetches use `cache: no-store`. Reopen saved songs through Library for offline reading. Artwork may be unavailable offline.

The web and iOS libraries are separate. There is no authentication or cloud sync. Browser storage can be cleared or evicted by the browser; it is not a backup. Remove individual songs or clear all library/history data in Settings. Browser language models are managed separately by the browser.

## Tests

```sh
node --test tests/web/*.test.mjs
# With the local server running and Playwright + Chromium installed:
python3 tests/web/browser.py
python3 tests/web/translation-browser.py
# Optional real-model integration check (downloads approximately 350 MB):
python3 tests/web/models.py
```

Domain tests cover URL validation, recording matching/ambiguity, timestamps, line alignment, escaping, opt-in storage, and demo consistency. Browser tests mock external API responses to deterministically exercise search, retrieval, manual translation, highlights, RTL, cached language switching, favorites, persistence, deletion of cached content, dark mode, and mobile overflow. Real iTunes and LRCLIB endpoints were separately checked for CORS support. Real model downloads are not simulated as proof of translation availability.

## Free hosting

The app can be hosted by any static HTTPS server. For GitHub Pages:

1. In **Settings → Pages**, select **GitHub Actions** as the source.
2. Run **Actions → Publish web app to GitHub Pages → Run workflow** on `main`.
3. Use the URL confirmed by the deployment, normally `https://kerollosl.github.io/lyrica/`.

The connected authoring credential could push code but GitHub returned HTTP 403 when enabling Pages. No live deployment is claimed until the workflow succeeds. Subsequent publications use the same manual workflow; no new PR is needed.

Lyrics and translations remain subject to their owners' rights. API access is not a license to store, publish, or redistribute material. See the repository README for attribution, licensing limitations, and privacy details.

## Interface and visual review

The interface uses system fonts, neutral light/dark surfaces, blue actions, compact controls, and flat rows with separators. Navigation moves from a plain header to a phone tab bar. Local SVG icons need no external service. The reader retains paired rows, independent RTL direction, keyboard focus, adjustable text, and a manual stacked layout. Reader options group text size, layout, and manual lyrics/translation entry. Favorites distinguish permitted offline content from metadata bookmarks.

See the [shared design system](../docs/DESIGN.md), [real screenshot matrix](../docs/web/screenshots/), and [updated MP4](../docs/lyrica-walkthrough.mp4). To regenerate the 24-screen matrix with a local server running:

```sh
python3 tests/web/capture.py --output /tmp/lyrica-redesign
```

Captures cover Search, Reader, Library, and Settings at 390, 768, and 1440px in light/dark appearance, using only original demo material. Mobile captures show the real viewport and fixed navigation.
