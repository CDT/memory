const CACHE = "memory-v7";
const ASSETS = [
    "./",
    "index.html",
    "style.css",
    "app.js",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "content/decks.json",
    "content/words/words.txt",
    "content/quotes/zengguang.txt",
    "content/japanese/dates.txt",
];

self.addEventListener("install", (event) => {
    const freshAssets = ASSETS.map((url) => new Request(url, { cache: "reload" }));
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(freshAssets)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(Promise.all([
        caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
        self.clients.claim(),
    ]));
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
    event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request)));
});
