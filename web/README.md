# Lyrica Web

A complete static browser companion to the native iPhone app. No build, npm install, backend, authentication, API keys, or paid translation service is required.

## Run locally

From the repository root:

```sh
python3 -m http.server 4173 --directory web
```

Open **http://localhost:4173**. Alternatively, `cd web && npm run dev`. Use HTTP/HTTPS, not `file://`, because modules, IndexedDB, and service workers require an appropriate origin. Localhost is a secure context for supported browser APIs.

Click **Open the bilingual demo** to immediately test the aligned reader, Arabic RTL, line highlighting, font size, layout switching, and language selection in any modern browser. The demo is original fictional material with included example translations, clearly labeled in the interface. It is not a live translation result or commercial song.

For real music, search by song/artist/album or paste an Apple Music song URL. Select the recording, retrieve its LRCLIB lyrics, and choose a target language. Paste original lyrics when unavailable. The iTunes storefront defaults to US for text search and respects the URL storefront for links.

## Translation differences from iOS

Apple Translation cannot run in a website. This version uses the browser's built-in **Translator API** where supported, currently compatible desktop Chrome versions/hardware and supported language pairs. The **LanguageDetector API** detects source language when its model is already available; otherwise choose the source manually. Language availability varies. Free model downloads may require a button click and browser consent. An internet connection and free disk space are needed for initial model downloads.

Safari, Firefox, most mobile browsers, and unsupported Chrome configurations can still search, retrieve lyrics, read original lyrics, and use **Paste a translation** to create a bilingual view. The included demo has English, French, Arabic, Italian, and Portuguese example translations. The web app never silently uses a cloud translator or paid API. Browser-native model downloads and quality remain device checks; automated tests do not prove real model availability.

Manual translations require one translated line per nonblank original line. Verse breaks are restored automatically. Changing original lyrics invalidates previous translations. Cached languages switch immediately without contacting a translation service.

## Storage and offline reading

IndexedDB stores metadata bookmarks, favorites, recent searches, and preferences on this browser. Original lyrics and translations are saved only after permitted-cache opt-in. Turning caching off clears existing content, retaining metadata. The app shell is cached by a service worker after the first online visit; API responses are never cached by the service worker, and API fetches use `cache: no-store`. Reopen saved songs through Library for offline reading. Artwork may be unavailable offline.

The web and iOS libraries are separate. There is no authentication or cloud sync. Browser storage can be cleared or evicted by the browser; it is not a backup. Remove individual songs or clear all library/history data in Settings. Browser language models are managed separately by the browser.

## Tests

```sh
node --test tests/web/*.test.mjs
# With the local server running and Playwright + Chromium installed:
python3 tests/web/browser.py
```

Domain tests cover URL validation, recording matching/ambiguity, timestamps, line alignment, escaping, opt-in storage, and demo consistency. Browser tests mock external API responses to deterministically exercise search, retrieval, manual translation, highlights, RTL, cached language switching, favorites, persistence, deletion of cached content, dark mode, and mobile overflow. Real iTunes and LRCLIB endpoints were separately checked for CORS support. Real model downloads are not simulated as proof of translation availability.

## Free hosting

The app can be hosted by any static HTTPS server. For GitHub Pages:

1. In **Settings → Pages**, select **GitHub Actions** as the source.
2. Run **Actions → Publish web app to GitHub Pages → Run workflow** on `main`.
3. Use the URL confirmed by the deployment, normally `https://kerollosl.github.io/lyrica/`.

The connected authoring credential could push code but GitHub returned HTTP 403 when enabling Pages. No live deployment is claimed until the workflow succeeds. Subsequent publications use the same manual workflow; no new PR is needed.

Lyrics and translations remain subject to their owners' rights. API access is not a license to store, publish, or redistribute material. See the repository README for attribution, licensing limitations, and privacy details.

## Modern UI and visual review

The current interface uses local Manrope fonts (SIL Open Font License included), local SVG icons, compact responsive navigation, clear reading surfaces, and artwork from actual saved history. No external font or icon service is called. The reader retains paired rows, independent RTL direction, keyboard focus, large text, and a manual stacked layout. Reader options group text size, layout, and manual lyrics/translation entry. Favorites distinguish permitted offline content from metadata bookmarks.

See the [shared design system](../docs/DESIGN.md), [real screenshot matrix](../docs/web/screenshots/), and [updated MP4](../docs/lyrica-walkthrough.mp4). To regenerate the 24-screen matrix with a local server running:

```sh
python3 tests/web/capture.py --output /tmp/lyrica-redesign
```

Captures cover Discover, Reader, Library, and Settings at 390, 768, and 1440px in light/dark appearance, using only original demo material. Mobile captures show the real viewport and fixed navigation.
