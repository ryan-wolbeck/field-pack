const CACHE_NAME = "field-pack-app-shell-v2";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "icons/icon.png",
  "brand/field-pack-logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(request)
        .then((response) => {
          const shouldCache =
            response.ok &&
            new URL(request.url).origin === self.location.origin &&
            !request.url.includes("chrome-extension");

          if (shouldCache) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("index.html");
          }

          return caches.match(request).then((cached) => cached || new Response("Offline", {
            status: 503,
            statusText: "Offline"
          }));
        })
  );
});
