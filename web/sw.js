const CACHE = "lyrica-shell-v8";
const RUNTIME = "lyrica-translation-runtime-v1";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.mjs",
  "./icons.mjs",
  "./core.mjs",
  "./services.mjs",
  "./store.mjs",
  "./search.mjs",
  "./translation.mjs",
  "./translation-models.mjs",
  "./translation-worker.mjs",
  "./translation-text.mjs",
  "./icon.png",
  "./icon-192.png",
  "./manifest.webmanifest",
];
self.addEventListener("install", (event) => {
  // Bypass the HTTP cache so a new version never precaches stale files.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(SHELL.map((path) => new Request(path, { cache: "reload" }))),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith("lyrica-shell-") && key !== CACHE) ||
                (key.startsWith("lyrica-translation-runtime-") && key !== RUNTIME),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  // Cache the large runtime only after a translation download is explicitly requested.
  if (new URL(event.request.url).pathname.includes("/vendor/transformers/")) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const saved = await cache.match(event.request);
        if (saved) return saved;
        const response = await fetch(event.request);
        if (response.ok) {
          try {
            await cache.put(event.request, response.clone());
          } catch {
            /* Optional storage. */
          }
        }
        return response;
      }),
    );
    return;
  }
  // Opening the app (including with a query string or a #song link) prefers a
  // fresh shell, but falls back to the cached one when offline or slow.
  if (event.request.mode === "navigate") {
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const fallback = () =>
          caches
            .match("./index.html", { ignoreSearch: true })
            .then((cached) => cached || fetch(event.request));
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(fallback());
          }
        }, 3000);
        fetch(event.request)
          .then((response) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(response.ok ? response : fallback());
          })
          .catch(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(fallback());
          });
      }),
    );
    return;
  }
  // Only static assets are cached here. Lyrics and metadata never enter this cache.
  const allowed = SHELL.map(
    (path) => new URL(path, self.registration.scope).href,
  );
  if (!allowed.includes(event.request.url.split("#")[0])) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
