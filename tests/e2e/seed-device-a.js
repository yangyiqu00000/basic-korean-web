#!/usr/bin/env node
// tests/e2e/seed-device-a.js — 用真实 js/sync.js 的设备上下文扮演「设备 A」
// 登录后播种：progress 1-0 / ai_history h1 / 收藏 가，并轮询服务端确认上云后退出。
// 供 tests/e2e/dual-device-ci.sh 在 conflict 模式前调用（conflict 依赖设备 A 已播种）。
// 用法：node tests/e2e/seed-device-a.js [baseUrl] <email> <pass>
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const BASE = process.argv[2] || "http://localhost:8788";
const EMAIL = process.argv[3];
const PASS = process.argv[4];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadDevice() {
  const ls = new Map();
  const storage = {
    getItem: k => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => ls.set(k, String(v)),
    removeItem: k => ls.delete(k)
  };
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Object, Array,
    String, Number, Boolean, RegExp, encodeURIComponent,
    fetch: (u, o) => fetch(u, o),
    localStorage: storage,
    document: { addEventListener() {}, getElementById() { return null; } },
    safeParse: (j, fb) => { if (j === null || j === undefined || j === "") return fb; try { return JSON.parse(j); } catch (e) { return fb; } },
    escapeHtml: s => String(s),
    showToast() {}, refreshCurrentPage() {}, currentPage: "home",
    rerenderWordList() {},
    getCollections: () => { const r = sandbox.safeParse(storage.getItem("korean_collections"), null); return r === null ? [] : r; },
    saveCollections: arr => storage.setItem("korean_collections", JSON.stringify(arr))
  };
  let src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "sync.js"), "utf8");
  src = src.replace('var API_BASE = "";', 'var API_BASE = "' + BASE + '";');
  vm.runInNewContext(src, sandbox, { filename: "sync.js" });
  return sandbox;
}

(async () => {
  const dev = loadDevice();
  await dev.doLogin(EMAIL, PASS);
  // 播种：progress 1-0 / ai_history h1 / 收藏 가
  dev.syncPut("korean_progress", { "1-0": true });
  dev.syncPut("korean_ai_history", [{ id: "h1", text: "A版", updatedAt: Date.now() - 5000 }]);
  const item = {
    id: "c_seed_" + Math.random().toString(36).slice(2, 8), userId: null,
    type: "word", text: "가", meaning: "去 (가다)", source: "manual", sourceRef: "",
    status: "new", note: "", createdAt: Date.now(), updatedAt: Date.now()
  };
  dev.saveCollections([item]);
  dev.syncCollect(item);
  // 等待推送完成（轮询服务端直至 1-0 与 가 到达）
  const deadline = Date.now() + 10000;
  let ok = false;
  while (Date.now() < deadline) {
    dev.pushDirtyBlobs();
    if (typeof dev.pushCollectionsDirty === "function") dev.pushCollectionsDirty();
    try {
      const s = dev.safeParse(dev.localStorage.getItem("korean_session"), null);
      const r = await fetch(BASE + "/api/sync", { headers: { "Content-Type": "application/json", Authorization: "Bearer " + (s && s.token) } });
      const data = await r.json();
      const u = JSON.parse(((data.blobs || []).find(b => b.key === "progress") || {}).data_json || "{}");
      const hasCol = (data.collections || []).some(c => c.text === "가");
      if (u.data && u.data["1-0"] === true && hasCol) { ok = true; break; }
    } catch (e) {}
    await sleep(200);
  }
  console.log(ok ? "SEED_OK" : "SEED_FAIL");
  process.exit(ok ? 0 : 1);
})();
