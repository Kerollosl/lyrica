const CACHE = "lyrica-shell-v4";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.mjs",
  "./icons.mjs",
  "./core.mjs",
  "./services.mjs",
  "./store.mjs",
  "./translation.mjs",
  "./icon.png",
  "./manifest.webmanifest",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("lyrica-shell-") && key !== CACHE)
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
  // Only the static application shell is cached. API responses never enter this cache.
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
