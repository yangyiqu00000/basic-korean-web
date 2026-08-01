#!/usr/bin/env node
// tests/e2e/dual-device-sync.js — 双设备冲突实测（方案 C 墓碑合并）
// 在隔离 vm 上下文加载【真实 js/sync.js】（独立 localStorage + 真实 API 请求），充当「设备 B」；
// 与预览浏览器（设备 A）共用同一账号，验证：并集合并 / 后写胜出 / 墓碑删除 / 收藏去重 / 清空复活防护 / 删除传播。
//
// 用法（需先启动 wrangler pages dev）：
//   node tests/e2e/dual-device-sync.js register            [baseUrl] [email] [pass]
//   node tests/e2e/dual-device-sync.js conflict <email> <pass>  [baseUrl]   # 设备 B 拉取A的数据→制造冲突→推送
//   node tests/e2e/dual-device-sync.js clear   <email> <pass>  [baseUrl]   # 设备 B 清空 progress + 删除收藏
//   node tests/e2e/dual-device-sync.js tomb    <email> <pass>  [baseUrl]   # 设备 B 离线删除收藏→墓碑防复活→自愈
//
// 同步等待语义：flush() 不再固定 sleep——轮询服务端直至断言成立（带超时），
// 消除慢网络下「pushDirtyBlobs 仍在 in-flight 时新脏数据落入 2s 防抖被 process.exit 截断」的竞态。
//
// 输出 PASS/FAIL 断言行，任一失败 exit 1（可接入 CI）。

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const MODE = process.argv[2] || "register";
const BASE = process.argv[process.argv.length - 1];
const BASE_URL = /^https?:\/\//.test(BASE) ? BASE : "http://localhost:8788";
const EMAIL = /^https?:\/\//.test(process.argv[3]) ? "duo_" + Date.now() + "@t.com" : (process.argv[3] || "duo_" + Date.now() + "@t.com");
const PASS = /^https?:\/\//.test(process.argv[4]) ? "Passw0rd!2026" : (process.argv[4] || "Passw0rd!2026");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const mkItem = (type, text, meaning, source, sourceRef) => ({
  id: "c_" + Math.random().toString(36).slice(2, 10),
  userId: null, type, text, meaning, source, sourceRef: sourceRef || "",
  status: "new", note: "", createdAt: Date.now(), updatedAt: Date.now()
});
let passN = 0, failN = 0;
const pass = (m) => { passN++; console.log("  \x1b[32m✅ PASS\x1b[0m " + m); };
const fail = (m) => { failN++; console.log("  \x1b[31m❌ FAIL\x1b[0m " + m); };

// 轮询等待条件成立（带超时）。check 每次尝试的异常（网络抖动）被吞掉重试，直至超时。
// 返回 true（成立）或 false（超时）。
async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + (timeoutMs || 10000);
  let lastErr = null;
  while (Date.now() < deadline) {
    try { if (await check()) return true; } catch (e) { lastErr = e; }
    await sleep(120);
  }
  console.warn("  ⚠ waitFor 超时: " + (label || "unnamed") + (lastErr ? " | 最后异常: " + lastErr.message : ""));
  return false;
}

// ---------- 独立设备上下文：fake localStorage + 加载真实 sync.js ----------
function loadDevice() {
  const ls = new Map();
  const storage = {
    getItem: k => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => ls.set(k, String(v)),
    removeItem: k => ls.delete(k),
    _dump: () => Object.fromEntries(ls)
  };
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Object, Array,
    String, Number, Boolean, RegExp, encodeURIComponent,
    fetch: (u, o) => fetch(u, o), // Node 全局 fetch；sync.js 用 API_BASE + path
    localStorage: storage,
    document: { addEventListener() {}, getElementById() { return null; } },
    safeParse: (j, fb) => { if (j === null || j === undefined || j === "") return fb; try { return JSON.parse(j); } catch (e) { return fb; } },
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    showToast() {},
    refreshCurrentPage() {},
    currentPage: "home",
    rerenderWordList() {},
    getCollections: () => { const r = sandbox.safeParse(storage.getItem("korean_collections"), null); return r === null ? [] : r; },
    saveCollections: arr => storage.setItem("korean_collections", JSON.stringify(arr))
  };
  let src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "sync.js"), "utf8");
  src = src.replace('var API_BASE = "";', 'var API_BASE = "' + BASE_URL + '";');
  vm.runInNewContext(src, sandbox, { filename: "sync.js" });
  return sandbox;
}

// 触发推送并等待断言成立（带超时）。
// 原理：反复调用 pushDirtyBlobs（幂等——in-flight 时直接返回；完成后 finally 会重调度，
// 轮询循环持续触发直至所有脏数据被推送，绕过 2s 防抖不被 process.exit 截断），
// 期间轮询 check() 直至其服务端断言成立（慢网络下等待真实收敛而非固定 sleep）。
// check 省略时退化为「等待无 in-flight 推送且无待推脏数据」。
async function flush(dev, check, timeoutMs) {
  return waitFor(async function() {
    dev.pushDirtyBlobs(); // 绕过 2s 防抖，直接推送；in-flight 时无操作，循环中持续重试
    if (typeof dev.pushCollectionsDirty === "function") dev.pushCollectionsDirty(); // 收藏脏数据一并推
    if (check) return await check();
    // 无 check：等到无 in-flight 且无待推脏数据（_pushInFlight 为 vm 上下文内全局）
    const meta = dev.safeParse(dev.localStorage.getItem("korean_sync_meta"), {});
    const dirty = Object.keys(meta).some(function(bk) {
      const st = meta[bk];
      return !!(st && st.updatedAt && st.updatedAt > (st.lastPushed || 0));
    });
    return !dev._pushInFlight && !dirty;
  }, timeoutMs || 10000, "flush");
}

async function rawFetch(p, o, dev) {
  const headers = { "Content-Type": "application/json" };
  // 设备侧服务端检查必须带 token（/api/sync 无 Bearer 会 401）
  if (dev) {
    const s = dev.safeParse(dev.localStorage.getItem("korean_session"), null);
    if (s && s.token) headers["Authorization"] = "Bearer " + s.token;
  }
  const r = await fetch(BASE_URL + p, Object.assign({ headers }, o || {}));
  if (r.status === 204) return { ok: true };
  try { return await r.json(); } catch (e) { return { status: r.status }; }
}

// ---------- 模式 1：注册（需邮箱验证码） ----------
async function modeRegister() {
  console.log("== 注册账号（邮箱验证） ==");
  const send = await rawFetch("/api/send-code", { method: "POST", body: JSON.stringify({ email: EMAIL, purpose: "register" }) });
  if (send && send.ok) {
    pass("验证码发送成功");
    const code = send.dev ? send.code : (process.env.RESEND_TEST_CODE || "");
    if (!code) { fail("生产环境需通过环境变量 RESEND_TEST_CODE 提供验证码"); process.exit(1); }
    const res = await rawFetch("/api/register", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASS, code }) });
    if (res.token) { pass("带码注册成功 " + EMAIL); console.log("ACCOUNT " + EMAIL + " " + PASS); }
    else { fail("注册失败: " + JSON.stringify(res)); }
  } else {
    fail("发送验证码失败: " + JSON.stringify(send));
  }
  process.exit(failN ? 1 : 0);
}

// ---------- 模式 2：设备 B 拉取 → 制造冲突 → 推送 ----------
async function modeConflict() {
  console.log("== 设备 B 登录（同一账号）==");
  const dev = loadDevice();
  await dev.doLogin(EMAIL, PASS);
  // 登录后 syncPullAll 是异步的：轮询等待 A 播种的数据到达本地（不固定 sleep）
  const pOk = await waitFor(function() {
    const p = JSON.parse(dev.localStorage.getItem("korean_progress") || "{}");
    return p["1-0"] === true;
  }, 10000, "progress 1-0 到达 B");
  pOk ? pass("A 勾选的任务 1-0 到达 B（跨端不丢）") : fail("1-0 未到达 B");
  const aOk = await waitFor(function() {
    return dev.getCollections().filter(c => c.text === "가").length === 1;
  }, 10000, "收藏 가 到达 B");
  aOk ? pass("A 的收藏 가 到达 B（无重复）") : fail("가 在 B 缺失或重复");
  const progress = JSON.parse(dev.localStorage.getItem("korean_progress") || "{}");
  const aiHist = JSON.parse(dev.localStorage.getItem("korean_ai_history") || "[]");
  console.log("B 拉取到 A 的数据 → progress:", JSON.stringify(progress), "| ai:", aiHist.length, "条 | 收藏:", dev.getCollections().map(c => c.text).join(","));

  // 场景 1：并集——B 勾选不同任务 1-1（A 已勾 1-0）
  console.log("== 场景1 并集：B 勾选 1-1 ==");
  progress["1-1"] = true;
  dev.syncPut("korean_progress", progress);
  // 轮询服务端直至断言成立：服务端应同时有 1-0 与 1-1（墓碑场景之前，显式验证不丢）
  const unionOk = await flush(dev, async function() {
    const srv = await rawFetch("/api/sync", null, dev);
    const u = JSON.parse(((srv.blobs || []).find(b => b.key === "progress") || {}).data_json || "{}");
    return !!(u.data && u.data["1-0"] === true && u.data["1-1"] === true);
  });
  unionOk ? pass("并集不丢：服务端同时含 1-0 与 1-1") : fail("并集失败（flush 超时）");

  // 场景 2：后写胜出——B 更新同一 ai_history 条目 id=h1（updatedAt 更新）
  console.log("== 场景2 后写胜出：B 改写 ai_history h1 ==");
  const h1 = aiHist.find(h => h.id === "h1");
  if (h1) {
    h1.text = "B版(后写)";
    h1.updatedAt = Date.now();
    dev.syncPut("korean_ai_history", aiHist);
    const h1Ok = await flush(dev, async function() {
      const srv = await rawFetch("/api/sync", null, dev);
      const ai = JSON.parse(((srv.blobs || []).find(b => b.key === "ai_history") || {}).data_json || "{}");
      const h = (ai.data || []).find(x => x.id === "h1");
      return !!(h && h.text === "B版(后写)");
    });
    h1Ok ? pass("B 改写 h1 并推送（服务端确认）") : fail("h1 改写未达服务端（flush 超时）");
  } else {
    fail("h1 未在 B 端找到（A 应已播种 ai_history h1）");
  }

  // 场景 3：墓碑——B 取消勾选 1-0（syncMarkDeleted）
  console.log("== 场景3 墓碑：B 取消勾选 1-0 ==");
  delete progress["1-0"];
  dev.syncMarkDeleted("korean_progress", "1-0");
  dev.syncPut("korean_progress", progress);
  const tombOk = await flush(dev, async function() {
    const srv = await rawFetch("/api/sync", null, dev);
    const p = JSON.parse(((srv.blobs || []).find(b => b.key === "progress") || {}).data_json || "{}");
    return !!(p.deleted && p.deleted["1-0"] && p.data && !p.data["1-0"]);
  });
  tombOk ? pass("墓碑：服务端 1-0 入 deleted 映射且从数据本体剔除") : fail("墓碑未推送（flush 超时）");

  // 场景 4：收藏去重——B 再次收藏 가（服务端幂等 upsert）+ 新增 바나나
  console.log("== 场景4 收藏去重：B 重复收藏 가 + 新增 바나나 ==");
  dev.saveCollections(dev.getCollections().concat([mkItem("word", "가", "去 (가다)", "manual", ""), mkItem("word", "바나나", "香蕉", "stems", "stem-12")]));
  dev.getCollections().forEach(c => dev.syncCollect(c));
  // syncCollect 是 fire-and-forget：轮询服务端直至断言成立（不固定 sleep）
  const colOk = await flush(dev, async function() {
    const srv = await rawFetch("/api/sync", null, dev);
    const cs = srv.collections || [];
    return cs.filter(c => c.text === "가").length === 1 && cs.some(c => c.text === "바나나" && c.source_ref === "stem-12");
  });
  colOk ? pass("收藏上云：가 去重 1 条 + 바나나 source_ref 保留") : fail("收藏上云失败（flush 超时）");

  // 服务端最终态（调试输出；各断言已在上方 flush 轮询中逐一确认，不重复断言）
  const srv = await rawFetch("/api/sync", null, dev);
  const srvProgress = JSON.parse((srv.blobs.find(b => b.key === "progress") || {}).data_json || "{}");
  const srvCols = srv.collections || [];
  const srvAi = JSON.parse((srv.blobs.find(b => b.key === "ai_history") || {}).data_json || "{}");
  console.log("服务端最终态 → progress:", JSON.stringify(srvProgress.data), "deleted:", JSON.stringify(srvProgress.deleted),
    "| 收藏:", srvCols.map(c => c.text + "/" + c.source_ref).join(","),
    "| ai h1:", JSON.stringify((srvAi.data || []).find(h => h.id === "h1")));

  process.exit(failN ? 1 : 0);
}

// ---------- 模式 3：设备 B 清空 progress（墓碑 clearedAt）+ 删除收藏 ----------
async function modeClear() {
  console.log("== 设备 B：清空 progress（清空复活防护）+ 删除收藏 가 ==");
  const dev = loadDevice();
  await dev.doLogin(EMAIL, PASS);
  const pulled = await waitFor(function() {
    return dev.localStorage.getItem("korean_progress") !== null;
  }, 10000, "登录拉取 progress");
  pulled ? pass("登录拉取完成（progress 已就绪）") : fail("登录拉取超时");

  // 场景 5：整体清空 → syncClearBlob（clearedAt 墓碑）
  dev.syncClearBlob("korean_progress");
  dev.syncPut("korean_progress", {});
  const clearOk = await flush(dev, async function() {
    const srv = await rawFetch("/api/sync", null, dev);
    const p = JSON.parse(((srv.blobs || []).find(b => b.key === "progress") || {}).data_json || "{}");
    return p.clearedAt > 0;
  });
  clearOk ? pass("清空墓碑 clearedAt 已推送") : fail("clearedAt 未推送（flush 超时）");

  // 场景 6：删除传播——B 删除收藏 가（用服务端 id）
  const cols = dev.getCollections();
  const apple = cols.find(c => c.text === "가");
  if (apple && apple.id) {
    dev.syncCollectDelete(apple.id, apple.type, apple.text);
    dev.saveCollections(cols.filter(c => c.id !== apple.id));
    const delOk = await flush(dev, async function() {
      const srv = await rawFetch("/api/sync", null, dev);
      return !(srv.collections || []).some(c => c.text === "가");
    });
    if (delOk) {
      pass("删除传播：服务端 가 已删除");
      const srv2 = await rawFetch("/api/sync", null, dev);
      (srv2.collections || []).some(c => c.text === "바나나") ? pass("바나나 仍保留（未误删）") : fail("바나나 被误删");
    } else {
      fail("删除传播失败（flush 超时）");
    }
  } else {
    fail("B 端未找到带 id 的 가 收藏，无法删除");
  }

  process.exit(failN ? 1 : 0);
}

// ---------- 模式 4：设备 B 离线删除收藏（删除墓碑防复活 + 自愈） ----------
async function modeTomb() {
  console.log("== 设备 B：离线删除收藏（墓碑防复活）==");
  const dev = loadDevice();
  await dev.doLogin(EMAIL, PASS); // doLogin 内部已 await syncPullAll，拉取合并同步完成
  pass("登录 + 首次拉取完成");

  // 播种一个收藏（设备 A 的视角，用 B 的会话 token）
  const seed = mkItem("word", "포도", "葡萄", "manual", "");
  const seeded = await rawFetch("/api/collections", { method: "POST", body: JSON.stringify({ item: seed }) }, dev);
  seeded && seeded.item ? pass("播种收藏 포도 到服务端") : fail("播种失败: " + JSON.stringify(seeded));

  // B 再拉取一次，拿到播种的 포도（播种发生在登录拉取之后，需主动触发二次拉取）
  await dev.syncPullAll();
  const got = await waitFor(function() {
    return dev.getCollections().some(c => c.text === "포도");
  }, 10000, "포도 到达 B");
  got ? pass("B 拉取到 포도") : fail("포도 未到达 B");
  const grape = dev.getCollections().find(c => c.text === "포도");

  // 模拟离线：劫持 dev.fetch，DELETE 一律失败（其余请求正常）
  const origFetch = dev.fetch;
  dev.fetch = (u, o) => {
    if (o && o.method === "DELETE") return Promise.reject(new Error("offline"));
    return origFetch(u, o);
  };

  // B 删除（本地移除 + syncCollectDelete）——DELETE 失败，墓碑应被记录
  dev.saveCollections(dev.getCollections().filter(c => c.id !== grape.id));
  dev.syncCollectDelete(grape.id, "word", "포도");
  await sleep(300);
  const tomb = JSON.parse(dev.localStorage.getItem("korean_collections_deleted") || "{}");
  tomb["word|포도"] ? pass("离线删除：墓碑已记录 word|포도") : fail("墓碑未记录");
  !dev.getCollections().some(c => c.text === "포도") ? pass("本地已移除 포도") : fail("本地移除失败");

  // 恢复网络，再拉取：无墓碑会复活，有墓碑不复活（syncPullAll 的合并是同步完成的）
  dev.fetch = origFetch;
  await dev.syncPullAll();
  const hasGrape = dev.getCollections().some(c => c.text === "포도");
  hasGrape ? fail("❌ 复活：离线删除的 포도 被拉取带回（墓碑失效）") : pass("墓碑生效：离线删除后拉取不复活 포도");

  // 墓碑应在拉取合并中触发重发 DELETE（自愈），服务端最终删除
  const healed = await waitFor(async function() {
    const srv = await rawFetch("/api/sync", null, dev);
    return !(srv.collections || []).some(c => c.text === "포도");
  }, 10000, "服务端自愈删除 포도");
  const tombAfter = JSON.parse(dev.localStorage.getItem("korean_collections_deleted") || "{}");
  tombAfter["word|포도"] ? fail("墓碑未清除（服务端已删但本地墓碑残留）") : pass("自愈后墓碑已清除");
  healed ? pass("自愈：墓碑重发 DELETE 后服务端已删 포도") : fail("服务端仍持有 포도");

  process.exit(failN ? 1 : 0);
}

(async () => {
  console.log("══════════════════════════════════════════");
  console.log(" 双设备冲突实测 | 设备B(Node)=" + BASE_URL + " | 账号=" + EMAIL);
  console.log("══════════════════════════════════════════");
  if (MODE === "register") await modeRegister();
  else if (MODE === "conflict") await modeConflict();
  else if (MODE === "clear") await modeClear();
  else if (MODE === "tomb") await modeTomb();
  else { console.error("未知模式: " + MODE); process.exit(1); }
})();
