// Basic Korean Web — Service Worker v3
// 缓存核心静态资源，支持离线学习
const CACHE = "basic-korean-v3";
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
  "/js/vue-app.js",
  "/js/components/HomePage.js",
  "/js/components/SkeletonPage.js",
  "/js/components/TrainingPage.js",
  "/js/components/StemsPage.js",
  "/js/components/AiPage.js",
  "/js/components/ScenePage.js",
  "/js/components/SchedulePage.js",
  "/js/components/ReferencePage.js",
  "/js/components/StatsPanel.js",
  "/manifest.json",
  "/assets/icon-192.svg",
  "/assets/icon-512.svg"
];

// 安装：预缓存核心资源
self.addEventListener("install", function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(URLS);
    })
  );
});

// 激活：清理旧缓存
self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
});

// 拦截：缓存优先 > 网络备用
self.addEventListener("fetch", function(e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // 音频文件：网络优先，缓存备用
  if (url.pathname.startsWith("/audio/")) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // 静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then(function(resp) {
      return resp || fetch(e.request).then(function(netResp) {
        return caches.open(CACHE).then(function(cache) {
          cache.put(e.request, netResp.clone());
          return netResp;
        });
      });
    }).catch(function() {
      return caches.match("/index.html");
    })
  );
});