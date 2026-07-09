// Basic Korean Web — Service Worker
// 缓存核心静态资源，支持离线学习（骨架规则/断句/词干/参考等均本地数据）
const CACHE = "basic-korean-v1";
const URLS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/data.js",
  "/js/rules_data.js",
  "/js/stems_data.js",
  "/js/sentences_data.js",
  "/js/reference_data.js",
  "/js/app.js",
  "/manifest.json",
  "/assets/icon-192.svg",
  "/assets/icon-512.svg"
];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) { return cache.addAll(URLS); })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) { return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); })); })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(e) {
  e.respondWith(
    caches.match(e.request).then(function(r) { return r || fetch(e.request); })
  );
});