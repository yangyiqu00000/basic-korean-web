// sw.js — 版本化安全 Service Worker（P2-2）
// 目标：拿回 PWA 离线能力，同时彻底规避「缓存不更新」的老问题。
// 核心规则：
//   1. 只缓存带 ?v= 版本戳的静态资源（JS/CSS）——版本戳变化 = 新 URL = 天然缓存隔离
//   2. 绝不缓存 HTML（/、/index.html）与 /api/*、/ai、/tts 动态接口——永远走网络
//   3. 更新策略：新 SW 安装后 skipWaiting 立即接管 + 删除旧版本缓存
// 由 index.html 注册。版本戳 v20260801d 起引入，升级时改 CACHE_VERSION。
var CACHE_VERSION = "bk-v1";
var CACHE_NAME = CACHE_VERSION + "-v20260801d";

self.addEventListener("install", function (event) {
  self.skipWaiting(); // 新版本立即激活，不等旧页面关闭
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      // 只清理本 SW 版本前缀（bk-v1-*）的旧缓存；绝不能动页面 P1-9 的 TTS 音频缓存（bk-tts-v1）
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME && k.indexOf(CACHE_VERSION + "-") === 0; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim(); // 接管所有已打开页面
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return; // 只处理 GET

  var url = new URL(req.url);
  // 跨域（Google Fonts / 外部资源）不拦截，交给浏览器默认策略
  if (url.origin !== location.origin) return;
  // 动态接口绝不缓存：HTML、API、AI、TTS
  var path = url.pathname;
  if (path === "/" || path === "/index.html" || path === "/404.html") return;
  if (path.indexOf("/api/") === 0 || path.indexOf("/ai") === 0 || path.indexOf("/tts") === 0) return;
  // 只缓存带版本戳的静态资源
  if (!url.search || url.search.indexOf("v=") === -1) return;

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit; // 命中缓存直接返回
      return fetch(req).then(function (res) {
        if (res && res.ok && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, clone); });
        }
        return res;
      }).catch(function () { return hit; }); // 离线且有缓存 → 兜底
    })
  );
});
