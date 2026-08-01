// js/sync.js — Phase 2 云同步层（方案 C：整包 + 智能合并 + 墓碑）
// 设计文档：docs/design/v2-upgrade-plan.md §3.4
// 职责：
//   1. 会话管理（登录/注册/登出，token 存 localStorage korean_session）
//   2. syncPut(key, value)：写 localStorage + 标记脏 → 防抖 2s 推送整包 blob
//   3. 拉取合并：GET /api/sync → 按类型（map 并集 / arr 按 id）合并 + 墓碑处理
//   4. 登录后首次拉取：本地数据上云（推送本地有而云端没有的 blob）
//   5. collections 记录级同步（收藏/状态流转/删除直接调 API）
// 加载顺序：在 app.js 之后（依赖 safeParse/escapeHtml 等全局函数）

var API_BASE = ""; // 同源（生产走 Cloudflare Pages Functions /api/*；本地用 wrangler pages dev 同端口访问）
var SESSION_KEY = "korean_session";
var SYNC_META_KEY = "korean_sync_meta";

// localStorage key → blob key 映射（仅同步用户数据；korean_theme/voice/onboarded 属设备偏好不同步）
// Phase 3：korean_custom_scenes / korean_scene_history 迁出 blob，改走记录级 scenes / scene_messages 表（/api/scenes）
var SYNC_BLOB_MAP = {
  "korean_progress": "progress",
  "korean_training_done": "training_done",
  "korean_ai_history": "ai_history",
  "korean_dismissed_tips": "dismissed_tips"
};
// 合并类型：map = 布尔映射取并集（减墓碑）；arr = 数组按 id 合并（updated_at 后写胜出，墓碑时间晚于条目则删）
var SYNC_TYPES = {
  progress: "map", training_done: "map", dismissed_tips: "map",
  ai_history: "arr"
};

// ============================================================
// 会话管理
// ============================================================
function getSession() { return safeParse(localStorage.getItem(SESSION_KEY), null); }
function saveSession(s) {
  if (s && s.token) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}
function isLoggedIn() { return !!getSession(); }

// ============================================================
// 墓碑元数据（每个 blob 的 deleted 映射 / clearedAt / 本地更新时间）
// meta = { blobKey: { deleted: {id: ts}, clearedAt: ts, updatedAt: ts } }
// ============================================================
function getSyncMeta() { return safeParse(localStorage.getItem(SYNC_META_KEY), {}); }
function saveSyncMeta(m) { localStorage.setItem(SYNC_META_KEY, JSON.stringify(m)); }

function blobKeyOf(localKey) { return SYNC_BLOB_MAP[localKey] || null; }
function localKeyOf(blobKey) {
  for (var k in SYNC_BLOB_MAP) if (SYNC_BLOB_MAP[k] === blobKey) return k;
  return null;
}

// 标记删除（墓碑）：取消勾选 / 删除条目时调用
function syncMarkDeleted(localKey, id) {
  if (!isLoggedIn()) return;
  var bk = blobKeyOf(localKey);
  if (!bk) return;
  var m = getSyncMeta();
  m[bk] = m[bk] || { deleted: {}, clearedAt: 0, updatedAt: 0 };
  m[bk].deleted[id] = Date.now();
  m[bk].updatedAt = Date.now();
  saveSyncMeta(m);
  scheduleSyncPush();
}

// 整体清空（墓碑 clearedAt）：clearData 时调用
function syncClearBlob(localKey) {
  if (!isLoggedIn()) return;
  var bk = blobKeyOf(localKey);
  if (!bk) return;
  var m = getSyncMeta();
  m[bk] = { deleted: {}, clearedAt: Date.now(), updatedAt: Date.now() };
  saveSyncMeta(m);
  scheduleSyncPush();
}

// 写 localStorage + 标记脏（替换直接 setItem 的入口）
function syncPut(localKey, value) {
  // arr 类型：写入前补齐稳定 id（持久化，供删除墓碑定位）
  var bk0 = blobKeyOf(localKey);
  if (bk0 && SYNC_TYPES[bk0] === "arr" && Array.isArray(value)) {
    value.forEach(ensureItemId);
  }
  localStorage.setItem(localKey, JSON.stringify(value));
  if (!isLoggedIn()) return;
  var bk = bk0;
  if (!bk) return;
  var m = getSyncMeta();
  m[bk] = m[bk] || { deleted: {}, clearedAt: 0, updatedAt: 0 };
  m[bk].updatedAt = Date.now();
  saveSyncMeta(m);
  scheduleSyncPush();
}

// ============================================================
// 推送（防抖 2s，整包 + 墓碑）
// ============================================================
var _pushTimer = null;
var _pushInFlight = false;
function scheduleSyncPush() {
  if (!isLoggedIn() || _pushTimer || _pushInFlight) return;
  _pushTimer = setTimeout(function() {
    _pushTimer = null;
    pushDirtyBlobs();
  }, 2000);
}

// 从 localStorage 读原始数据 → 组装墓碑结构 {data, deleted, clearedAt}
function buildBlobPayload(bk, m) {
  var lk = localKeyOf(bk);
  var raw = safeParse(localStorage.getItem(lk), null);
  if (raw === null) raw = SYNC_TYPES[bk] === "map" ? {} : [];
  return {
    key: bk,
    data_json: JSON.stringify({ data: raw, deleted: m[bk].deleted || {}, clearedAt: m[bk].clearedAt || 0 }),
    updated_at: m[bk].updatedAt || Date.now()
  };
}

function pushDirtyBlobs() {
  if (!isLoggedIn() || _pushInFlight) return;
  _pushInFlight = true;
  var m = getSyncMeta();
  var blobs = [];
  for (var bk in m) {
    if (!SYNC_BLOB_MAP[localKeyOf(bk)]) continue; // 只推已映射的 key
    var st = m[bk];
    if (st && st.updatedAt && st.updatedAt > (st.lastPushed || 0)) blobs.push(buildBlobPayload(bk, m));
  }
  if (blobs.length === 0) { _pushInFlight = false; return; }
  apiFetch("/api/sync", { method: "POST", body: JSON.stringify({ blobs: blobs }) })
    .then(function(res) {
      if (res && res.ok) {
        // 记录已推送时间
        var m2 = getSyncMeta();
        blobs.forEach(function(b) { if (m2[b.key]) m2[b.key].lastPushed = b.updated_at; });
        saveSyncMeta(m2);
      }
    })
    .catch(function() {})
    .finally(function() {
      _pushInFlight = false;
      // 竞态修复：推送期间可能产生新脏数据（lastPushed 未更新）→ 重新调度
      if (isLoggedIn()) {
        var m3 = getSyncMeta();
        for (var bk in m3) {
          var st = m3[bk];
          if (st && st.updatedAt && st.updatedAt > (st.lastPushed || 0)) {
            scheduleSyncPush();
            break;
          }
        }
      }
    });
}

// ============================================================
// API 封装（统一 token 头 + 401 自动登出）
// ============================================================
function apiFetch(path, opts) {
  opts = opts || {};
  var headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  var s = getSession();
  if (s) headers["Authorization"] = "Bearer " + s.token;
  return fetch(API_BASE + path, {
    method: opts.method || "GET",
    headers: headers,
    body: opts.body || undefined
  }).then(function(res) {
    if (res.status === 401) { clearSession(); return null; }
    if (res.status === 204) return { ok: true };
    return res.json().catch(function() { return null; });
  });
}

// ============================================================
// 拉取 + 合并（登录后 / 页面加载时调用）
// ============================================================
// map 类型：并集（任一 true 即 true），减去 deleted
// 注意：全新设备本地可能没有该 blob（localData 为 null），必须 null 安全，否则登录拉取直接崩溃
function mergeMap(localData, remoteData, deleted) {
  var out = {};
  var keys = {};
  Object.keys(localData || {}).forEach(function(k) { keys[k] = 1; });
  Object.keys(remoteData || {}).forEach(function(k) { keys[k] = 1; });
  Object.keys(keys).forEach(function(k) {
    if (deleted[k]) return;
    // 两端都要 null 安全：remoteData 在旧版裸格式 blob / JSON 解析失败时可能为 undefined
    out[k] = !!((localData || {})[k] || (remoteData || {})[k]);
  });
  return out;
}
// 确定性稳定 id：无 id 的旧数据（如 custom_scenes）用内容哈希生成，两端一致且可持久化
function stableIdOf(it) {
  var base = String(it.title || it.text || it.input || "") + "|" + String(it.prompt || it.meaning || "");
  var h = 5381;
  for (var i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) | 0;
  return "x" + Math.abs(h).toString(36);
}
// 为条目补齐稳定 id（写入条目本身，随后持久化到 localStorage）
function ensureItemId(it) {
  if (!it || typeof it !== "object") return null;
  if (it.id) return it.id;
  it.id = it.time ? "t" + it.time + "_" + String(it.title || it.text || it.input || "").slice(0, 8) : stableIdOf(it);
  return it.id;
}
// arr 类型：按 id 合并，updated_at 后写胜出；墓碑时间晚于条目 updated_at 则删
function mergeArr(localArr, remoteArr, deleted) {
  var map = {};
  [localArr, remoteArr].forEach(function(arr) {
    (arr || []).forEach(function(it) {
      var id = ensureItemId(it);
      if (!id) return;
      var cur = map[id];
      var itTs = it.updatedAt || it.time || 0;
      var curTs = cur ? (cur.updatedAt || cur.time || 0) : -1;
      if (!cur || itTs >= curTs) map[id] = it;
    });
  });
  return Object.keys(map).map(function(id) {
    var it = map[id];
    var delTs = deleted[id];
    var itTs = it.updatedAt || it.time || 0;
    if (delTs && delTs > itTs) return null; // 墓碑晚于条目 → 删除
    return it;
  }).filter(Boolean);
}

// 合并单个 blob（云端 → 本地），返回是否变化
function mergeBlobFromServer(bk, remote) {
  var lk = localKeyOf(bk);
  if (!lk) return false;
  var m = getSyncMeta();
  var st = m[bk] || { deleted: {}, clearedAt: 0, updatedAt: 0 };
  var localRaw = safeParse(localStorage.getItem(lk), null);
  var type = SYNC_TYPES[bk];

  var remoteObj = {};
  try { remoteObj = JSON.parse(remote.data_json); } catch (e) {}
  var remoteData = remoteObj.data;
  var remoteDeleted = remoteObj.deleted || {};
  var remoteClearedAt = remoteObj.clearedAt || 0;
  var remoteTs = remote.updated_at || 0;

  var merged;
  if (type === "map") {
    // clearedAt 裁决：比较 clearedAt 与另一端数据最新时间戳，取晚者权威
    var localAnyTs = st.clearedAt || 0;
    var remoteAnyTs = Math.max(remoteClearedAt, remoteTs);
    if (st.clearedAt > 0 && st.clearedAt > remoteAnyTs && remoteAnyTs > 0) {
      merged = {}; // 本地清空晚于云端任何数据 → 本地权威
      m[bk] = { deleted: {}, clearedAt: st.clearedAt, updatedAt: st.clearedAt, lastPushed: 0 };
    } else if (remoteClearedAt > 0 && remoteClearedAt > (st.updatedAt || 0)) {
      merged = {}; // 云端清空晚于本地最后写入 → 云端权威
      st.deleted = {}; st.clearedAt = remoteClearedAt; st.updatedAt = remoteClearedAt; st.lastPushed = remoteTs;
      m[bk] = st;
    } else {
      var del = Object.assign({}, st.deleted || {}, remoteDeleted);
      merged = mergeMap(localRaw, remoteData, del);
      m[bk] = { deleted: del, clearedAt: Math.max(st.clearedAt || 0, remoteClearedAt || 0), updatedAt: Math.max(st.updatedAt || 0, remoteTs), lastPushed: 0 };
    }
  } else {
    var delArr = Object.assign({}, st.deleted || {}, remoteDeleted);
    merged = mergeArr(localRaw || [], remoteData || [], delArr);
    m[bk] = { deleted: delArr, clearedAt: Math.max(st.clearedAt || 0, remoteClearedAt || 0), updatedAt: Math.max(st.updatedAt || 0, remoteTs), lastPushed: 0 };
  }

  var prev = JSON.stringify(localRaw);
  localStorage.setItem(lk, JSON.stringify(merged));
  saveSyncMeta(m);
  return JSON.stringify(merged) !== prev;
}

// 登录后拉取全量 + 合并 → 推送本地有而云端没有的（首次上云）
function syncPullAll() {
  if (!isLoggedIn()) return Promise.resolve();
  return apiFetch("/api/sync").then(function(data) {
    if (!data) return;
    var changed = false;
    (data.blobs || []).forEach(function(b) {
      if (mergeBlobFromServer(b.key, b)) changed = true;
    });
    // collections 合并（按 type+text upsert）
    if (Array.isArray(data.collections)) mergeCollectionsFromServer(data.collections);
    // Phase 3：记录级场景合并（custom → 我的场景 / history → 对话记录）
    if (Array.isArray(data.scenes)) mergeScenesFromServer(data.scenes);
    if (changed) refreshCurrentPage && refreshCurrentPage();
    // 本地有而云端没有的 blob → 推送上去
    scheduleSyncPush();
    pushCollectionsDirty();
    // 旧本地场景（Phase 2 离线积攒）首次登录上云
    pushLocalScenesIfMissing(data);
  });
}

// ============================================================
// 临境场景（记录级，Phase 3）
// ============================================================
// 服务端 snake_case 场景行 → 前端条目
function normalizeServerScene(sc) {
  return {
    id: sc.id,
    title: sc.title,
    prompt: sc.prompt || "",
    kind: sc.kind || "custom",
    icon: "🎯",
    desc: (sc.prompt || "").substring(0, 40) + "...",
    createdAt: sc.created_at,
    updatedAt: sc.updated_at
  };
}
// 云端场景合并进本地（custom → korean_custom_scenes 按 title upsert；history → korean_scene_history 重建计数镜像）
function mergeScenesFromServer(scenes) {
  var customScenes = scenes.filter(function(s) { return s.kind === "custom"; });
  var local = safeParse(localStorage.getItem("korean_custom_scenes"), []);
  var map = {};
  local.forEach(function(s) { if (s && s.title) map[s.title] = s; });
  customScenes.forEach(function(sc) {
    var item = normalizeServerScene(sc);
    var cur = map[item.title];
    if (!cur) { map[item.title] = item; }
    else if (item.updatedAt > (cur.updatedAt || 0)) {
      // 云端更新 → 覆盖（保留本地已有 id 的引用）
      map[item.title] = Object.assign({}, cur, { prompt: item.prompt, updatedAt: item.updatedAt, id: item.id });
    } else if (!cur.id && item.id) {
      cur.id = item.id; // 本地无 id 的旧条目补云端 id，保证删除能命中
    }
  });
  var merged = Object.keys(map).map(function(k) { return map[k]; });
  localStorage.setItem("korean_custom_scenes", JSON.stringify(merged));

  // history 场景：重建本地对话记录镜像（消息不回填本地，仅计数一致；服务端为权威存档；保留 id 供 clearData 删云端）
  var historyMirror = scenes.filter(function(s) { return s.kind === "history"; })
    .map(function(sc) { return { id: sc.id, title: sc.title, time: sc.updated_at, messages: [] }; });
  localStorage.setItem("korean_scene_history", JSON.stringify(historyMirror));
  refreshCurrentPage && refreshCurrentPage();
}
// 创建自定义场景（保存场景时调用；返回服务端 id 回写本地条目）
function syncSceneCreate(item) {
  if (!isLoggedIn()) return Promise.resolve(null);
  return apiFetch("/api/scenes", {
    method: "POST",
    body: JSON.stringify({ title: item.title, prompt: item.prompt, kind: "custom" })
  }).then(function(res) {
    if (res && res.scene) {
      item.id = res.scene.id; // 回写本地条目 id（供删除命中云端）
      var local = safeParse(localStorage.getItem("korean_custom_scenes"), []);
      local.forEach(function(s) { if (s.title === item.title) s.id = res.scene.id; });
      localStorage.setItem("korean_custom_scenes", JSON.stringify(local));
    }
    return res;
  }).catch(function() { return null; });
}
// 删除自定义场景（删除时调用）
function syncSceneDelete(id) {
  if (!isLoggedIn()) return;
  apiFetch("/api/scenes/" + encodeURIComponent(id), { method: "DELETE" }).catch(function() {});
}
// 对话存档（finishSceneChat 调用）：kind=history 场景 + 批量消息一次入库；回写服务端 id 到本地条目（供 clearData 删云端）
function syncSceneArchive(title, messages, entry) {
  if (!isLoggedIn()) return;
  var msgs = (messages || []).slice(0, 200).map(function(m) {
    return { role: m.role === "user" ? "user" : "assistant", content: String(m.kr || m.content || "") };
  }).filter(function(m) { return m.content; });
  apiFetch("/api/scenes", {
    method: "POST",
    body: JSON.stringify({ title: String(title || "未命名对话"), prompt: "", kind: "history", messages: msgs })
  }).then(function(res) {
    if (res && res.scene && entry && typeof entry === "object") {
      entry.id = res.scene.id;
      var local = safeParse(localStorage.getItem("korean_scene_history"), []);
      local.forEach(function(h) { if (h === entry || (h.title === entry.title && h.time === entry.time)) h.id = res.scene.id; });
      localStorage.setItem("korean_scene_history", JSON.stringify(local));
    }
  }).catch(function() {});
}
// 旧本地场景上云：本地有而云端没有的 custom 场景逐条创建、无云端 history 时整包存档
function pushLocalScenesIfMissing(data) {
  if (!isLoggedIn()) return;
  var serverCustomTitles = {};
  (data.scenes || []).forEach(function(s) { if (s.kind === "custom") serverCustomTitles[s.title] = 1; });
  safeParse(localStorage.getItem("korean_custom_scenes"), []).forEach(function(s) {
    if (s && s.title && !serverCustomTitles[s.title]) syncSceneCreate(s);
  });
  var hasServerHistory = (data.scenes || []).some(function(s) { return s.kind === "history"; });
  if (!hasServerHistory) {
    safeParse(localStorage.getItem("korean_scene_history"), []).forEach(function(h) {
      if (h && h.title) syncSceneArchive(h.title, h.messages || []);
    });
  }
}

// ============================================================
// collections 记录级同步
// ============================================================
// ============================================================
// collections 删除墓碑（记录级，v0.5）
// localStorage["korean_collections_deleted"] = { "type|text": { id, ts } }
// 语义：syncCollectDelete 先记墓碑（无论网络成败）再发 DELETE；离线失败时墓碑保留，
// 下次拉取 merge 时若服务端条目 updatedAt < 墓碑 ts → 视为已删除（不复活）+ 重发 DELETE 自愈；
// 服务端条目 updatedAt > 墓碑 ts → 删除后被另一端重新收藏/编辑，后写胜出复活并清墓碑；
// 服务端已无该 key 且本地也无 → 删除已确认，剪枝墓碑。
// ⚠️ 局限：ts 比较是客户端 LWW，跨设备时钟偏移下删除裁决可能偏差（与 blob 墓碑同限制，可接受）。
// ============================================================
var COLL_DELETED_KEY = "korean_collections_deleted";
function getCollDeleted() { return safeParse(localStorage.getItem(COLL_DELETED_KEY), {}); }
function saveCollDeleted(m) { localStorage.setItem(COLL_DELETED_KEY, JSON.stringify(m)); }
function clearCollTombstone(k) {
  var d = getCollDeleted();
  if (d[k]) { delete d[k]; saveCollDeleted(d); }
}

// 服务端 snake_case 行 → 前端 camelCase 条目（与本地存储结构一致）
function normalizeServerCollection(sc) {
  return {
    id: sc.id,
    userId: sc.user_id,
    type: sc.type,
    text: sc.text,
    meaning: sc.meaning || "",
    source: sc.source || "manual",
    sourceRef: sc.source_ref || "",
    status: sc.status || "new",
    note: sc.note || "",
    createdAt: sc.created_at,
    updatedAt: sc.updated_at
  };
}
function mergeCollectionsFromServer(serverItems) {
  var local = getCollections();
  var pushedIds = safeParse(localStorage.getItem("korean_collections_pushed"), {});
  var collDeleted = getCollDeleted();
  var srvKeys = {};
  serverItems.forEach(function(sc) { srvKeys[sc.type + "|" + sc.text] = 1; });
  var map = {};
  local.forEach(function(c) {
    var k = c.type + "|" + c.text;
    // 删除传播：本地条目已上云（其 id 已入 pushedIds，即服务端回写过 id 或拉取时标记过）但本次拉取服务端没有
    // → 其他设备已删除 → 本地移除。
    // 取舍（有意设计，v0.4 明确）：**远程删除 > 离线编辑**——若本端离线编辑过该条目（updatedAt 更新）
    // 而另一端已删除，合并时以删除为准、离线编辑丢弃；否则已删条目会从本端"复活"，跨端删除永不生效。
    // 代价：真·离线编辑（未上云期间被远端删除）会丢失——属可接受的 LWW 取舍（服务端删除是即时权威操作）。
    // 仅保留**从未上云**的离线新条目（其 id 不在 pushedIds 中），稍后由 pushCollectionsDirty 推上去，不丢新数据。
    if (!srvKeys[k] && pushedIds[c.id]) return;
    map[k] = c;
  });
  serverItems.forEach(function(sc) {
    var item = normalizeServerCollection(sc);
    var k = item.type + "|" + item.text;
    var tb = collDeleted[k];
    if (tb && tb.ts > (item.updatedAt || 0)) {
      // 删除墓碑（v0.5）：本端删除时间晚于服务端条目更新 → 服务端仍持有的是本端已删的旧条目
      // → 不合并回来（防复活），并用**服务端条目真实 id**（item.id）重发 DELETE 自愈（离线删除恢复网络后补刀）。
      // 注意优先用 item.id 而非墓碑里的本地 id：墓碑可能存的是离线时的临时 id，指向服务端会 404 卡死；
      // item.id 是当前服务端行的真实 id，保证删除命中（type|text 是去重键，语义一致）。
      var delId = item.id || tb.id;
      if (delId) {
        apiFetch("/api/collections/" + encodeURIComponent(delId), { method: "DELETE" })
          .then(function(res) {
            if (res && res.ok) clearCollTombstone(k); // 服务端确认删除 → 清墓碑
          })
          .catch(function() {});
      }
      return; // 跳过该服务端条目（不复活）
    }
    if (tb) {
      // 服务端条目更新晚于墓碑（删除后被重新收藏/编辑）→ 后写胜出，复活并清墓碑
      delete collDeleted[k];
    }
    var lc = map[k];
    if (!lc || (item.updatedAt > (lc.updatedAt || 0))) map[k] = item; // 云端更新 → 覆盖
    // 纯拉取设备保护：服务端拿到的条目标记为已推送，保证后续删除传播能命中（不依赖再 POST 自愈）
    pushedIds[item.id] = item.updatedAt;
  });
  // 墓碑剪枝：服务端与本地都不再有该 key → 删除已确认，墓碑作废（避免无限膨胀）
  Object.keys(collDeleted).forEach(function(k) {
    if (!srvKeys[k] && !map[k]) delete collDeleted[k];
  });
  saveCollDeleted(collDeleted);
  localStorage.setItem("korean_collections_pushed", JSON.stringify(pushedIds));
  var merged = Object.keys(map).map(function(k) { return map[k]; });
  if (JSON.stringify(merged) !== JSON.stringify(local)) {
    saveCollections(merged);
    refreshCurrentPage && refreshCurrentPage();
  }
}
// 本地比云端新的收藏重新推送（后写胜出）
function pushCollectionsDirty() {
  if (!isLoggedIn()) return;
  var local = getCollections();
  var s = getSession();
  if (!s) return;
  var pushedIds = safeParse(localStorage.getItem("korean_collections_pushed"), {});
  local.forEach(function(c) {
    if (!pushedIds[c.id] || pushedIds[c.id] < c.updatedAt) {
      apiFetch("/api/collections", { method: "POST", body: JSON.stringify({ item: c }) })
        .then(function(res) {
          if (res && res.item) {
            pushedIds[res.item.id] = res.item.updated_at;
            localStorage.setItem("korean_collections_pushed", JSON.stringify(pushedIds));
          }
        })
        .catch(function() {});
    }
  });
}
// 收藏（collectItem 内调用）
function syncCollect(item) {
  if (!isLoggedIn()) return;
  apiFetch("/api/collections", { method: "POST", body: JSON.stringify({ item: item }) })
    .then(function(res) {
      if (res && res.item) {
        // 重新收藏成功 → 该 key 的删除墓碑作废（用户明确要保留它）
        clearCollTombstone(item.type + "|" + item.text);
        var pushed = safeParse(localStorage.getItem("korean_collections_pushed"), {});
        pushed[res.item.id] = res.item.updated_at;
        localStorage.setItem("korean_collections_pushed", JSON.stringify(pushed));
        // 服务端返回的 id 可能与本地临时 id 不同（后端自生成）→ 回写本地，保证删除/状态流转命中云端记录
        if (res.item.id && res.item.id !== item.id) {
          var list = getCollections();
          list.forEach(function(c) { if (c.type === item.type && c.text === item.text) c.id = res.item.id; });
          saveCollections(list);
          // 只在词句表页面当前显示时安全重绘（.wordlist-page-vue 根节点），绝不整页刷新
          // —— 收藏动作可能发生在 AI/临境等有进行中状态的页面，无条件 refreshCurrentPage 会打断它们
          if (typeof currentPage === "string" && currentPage === "wordlist" && typeof rerenderWordList === "function") {
            rerenderWordList();
          }
        }
      }
    })
    .catch(function() {});
}
// 状态流转（setCollectStatus 内调用）
function syncCollectStatus(id, status) {
  if (!isLoggedIn()) return;
  var c = getCollections().filter(function(x) { return x.id === id; })[0];
  if (!c) return;
  apiFetch("/api/collections", { method: "POST", body: JSON.stringify({ item: Object.assign({}, c, { status: status, updatedAt: Date.now() }) }) })
    .catch(function() {});
}
// 删除（deleteCollect 内调用）——先记墓碑再发 DELETE：
// 即使离线（DELETE 失败），墓碑也保证下次拉取不复活该条目（v0.5 修复离线删除不生效）
function syncCollectDelete(id, type, text) {
  if (!isLoggedIn()) return;
  var k = (type && text) ? (type + "|" + text) : "";
  if (k) {
    var d = getCollDeleted();
    d[k] = { id: id, ts: Date.now() };
    saveCollDeleted(d);
  }
  apiFetch("/api/collections/" + encodeURIComponent(id), { method: "DELETE" })
    .then(function(res) {
      if (res && res.ok && k) clearCollTombstone(k); // 在线删除成功 → 立即清墓碑
    })
    .catch(function() {}); // 离线失败：墓碑保留，下次拉取自愈
}

// ============================================================
// 登录 / 注册 / 登出 + UI
// ============================================================
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  updateAuthUI();
}
function doLogin(email, password) {
  return apiFetch("/api/login", { method: "POST", body: JSON.stringify({ email: email, password: password }) })
    .then(function(res) {
      if (res && res.token) {
        saveSession({ token: res.token, userId: res.userId, email: res.email });
        updateAuthUI();
        return syncPullAll();
      }
      throw new Error((res && res.error) || "登录失败");
    });
}
function doRegister(email, password, code) {
  return apiFetch("/api/register", { method: "POST", body: JSON.stringify({ email: email, password: password, code: code }) })
    .then(function(res) {
      if (res && res.token) {
        saveSession({ token: res.token, userId: res.userId, email: res.email });
        updateAuthUI();
        // 注册成功后把本地数据推上云
        markAllLocalDirty();
        return syncPullAll();
      }
      throw new Error((res && res.error) || "注册失败");
    });
}
// 发送邮箱验证码（注册 / 重置双用途）
function sendAuthCode(purpose) {
  var email = (document.getElementById("authEmail").value || "").trim();
  var btn = document.getElementById("authCodeBtn");
  var errEl = document.getElementById("authErr");
  if (!email) { errEl.textContent = "请先输入邮箱"; return; }
  if (btn) { btn.disabled = true; btn.textContent = "发送中…"; }
  apiFetch("/api/send-code", { method: "POST", body: JSON.stringify({ email: email, purpose: purpose }) })
    .then(function(res) {
      if (res && res.ok) {
        errEl.textContent = res.dev ? "（本地开发）验证码已自动填充" : "验证码已发送，请查收邮箱";
        if (res.dev && res.code) document.getElementById("authCode").value = res.code; // 本地无邮件 API：自动填充供测试
        var codeEl = document.getElementById("authCode");
        if (codeEl) codeEl.style.display = "block";
      } else {
        errEl.textContent = (res && res.error) || "发送失败，请稍后再试";
      }
    })
    .catch(function() { errEl.textContent = "发送失败，请检查网络"; })
    .finally(function() {
      if (btn) { btn.disabled = false; btn.textContent = "获取验证码"; }
    });
}
// 密码重置
function submitReset() {
  var email = (document.getElementById("authEmail").value || "").trim();
  var code = (document.getElementById("authCode").value || "").trim();
  var pass = document.getElementById("authPass").value || "";
  var errEl = document.getElementById("authErr");
  var btn = document.getElementById("authSubmitBtn");
  if (!email || !code || !pass) { errEl.textContent = "请填写邮箱、验证码和新密码"; return; }
  if (pass.length < 8) { errEl.textContent = "新密码至少 8 位"; return; }
  errEl.textContent = ""; btn.disabled = true; btn.textContent = "重置中…";
  apiFetch("/api/reset-password", { method: "POST", body: JSON.stringify({ email: email, code: code, newPassword: pass }) })
    .then(function(res) {
      if (res && res.ok) {
        errEl.textContent = "";
        closeAuthModal();
        showToast("✅ 密码已重置，请用新密码登录");
      } else {
        errEl.textContent = (res && res.error) || "重置失败，请稍后再试";
      }
    })
    .catch(function() { errEl.textContent = "重置失败，请检查网络"; })
    .finally(function() { if (btn) { btn.disabled = false; btn.textContent = "重置密码"; } });
}
function doLogout() {
  var s = getSession();
  if (s) apiFetch("/api/logout", { method: "POST" }).catch(function() {});
  clearSession();
  showToast("已退出登录，数据保留在本地");
}
// 首次注册：本地已有的 6 个 blob 全部标记脏 → 推送
function markAllLocalDirty() {
  var m = getSyncMeta();
  var now = Date.now();
  for (var lk in SYNC_BLOB_MAP) {
    if (localStorage.getItem(lk) !== null) {
      var bk = SYNC_BLOB_MAP[lk];
      m[bk] = m[bk] || { deleted: {}, clearedAt: 0, updatedAt: 0 };
      m[bk].updatedAt = now;
    }
  }
  saveSyncMeta(m);
  scheduleSyncPush();
}

// 登录按钮 UI 更新
function updateAuthUI() {
  var btn = document.getElementById("authBtn");
  if (!btn) return;
  var s = getSession();
  if (s) {
    btn.textContent = "👤 " + (s.email || "").split("@")[0];
    btn.title = s.email + "（点击管理账号）";
  } else {
    btn.textContent = "👤 登录";
    btn.title = "登录 / 注册，云端同步学习数据";
  }
}

// 登录/注册弹窗
function openAuthModal() {
  var s = getSession();
  var body = s
    ? '<h2>👤 账号</h2>' +
      '<p style="margin:10px 0;">已登录：<strong>' + escapeHtml(s.email) + '</strong></p>' +
      '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button class="ai-submit-btn" onclick="syncPullAll(); showToast(\'🔄 已手动同步\')">🔄 立即同步</button>' +
        '<button class="ai-suggest-btn" style="color:var(--error);border-color:var(--error);" onclick="doLogout()">🚪 退出登录</button>' +
      '</div>' +
      '<p style="margin-top:14px;font-size:12px;color:var(--text-light);">学习进度 / 词句表 / AI 历史 / 情景对话 将自动云端同步。</p>'
    : '<h2>👤 登录 / 注册</h2>' +
      '<div class="filter-bar" style="margin-bottom:10px;">' +
        '<button class="filter-btn active" id="authTabLogin" onclick="switchAuthTab(\'login\')">登录</button>' +
        '<button class="filter-btn" id="authTabReg" onclick="switchAuthTab(\'register\')">注册</button>' +
      '</div>' +
      '<input id="authEmail" class="ai-input" type="email" placeholder="邮箱" style="width:100%;box-sizing:border-box;margin-bottom:8px;" />' +
      '<input id="authPass" class="ai-input" type="password" placeholder="密码（至少 8 位）" style="width:100%;box-sizing:border-box;margin-bottom:8px;" onkeydown="if(event.key===\'Enter\')submitAuth()" />' +
      '<div id="authCodeRow" style="display:none;margin-bottom:8px;">' +
        '<div style="display:flex;gap:8px;">' +
          '<input id="authCode" class="ai-input" type="text" inputmode="numeric" placeholder="6 位验证码" style="flex:1;min-width:0;" />' +
          '<button class="ai-suggest-btn" style="white-space:nowrap;" id="authCodeBtn" onclick="sendAuthCode(getAuthPurpose())">获取验证码</button>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--text-light);margin:4px 0 0;">验证码将发送到你的邮箱，10 分钟内有效。</p>' +
      '</div>' +
      '<button class="ai-submit-btn" style="width:100%;" id="authSubmitBtn" onclick="submitAuth()">登录</button>' +
      '<p id="authErr" style="margin-top:10px;font-size:13px;color:var(--error);min-height:16px;"></p>' +
      '<p style="margin-top:6px;font-size:12px;color:var(--text-light);">' +
        '<a href="javascript:void(0)" id="authForgot" onclick="switchAuthTab(\'reset\')" style="color:var(--primary);">忘记密码？</a>' +
        '　·　登录后学习数据自动云端同步。' +
      '</p>';
  var overlay = document.createElement("div");
  overlay.className = "stats-overlay";
  overlay.id = "authOverlay";
  overlay.onclick = function(e) { if (e.target === overlay) closeAuthModal(); };
  overlay.innerHTML = '<div class="stats-modal" style="max-width:400px;">' +
    '<button class="stats-close" onclick="closeAuthModal()">✕</button>' + body + '</div>';
  document.body.appendChild(overlay);
}
function closeAuthModal() {
  var o = document.getElementById("authOverlay");
  if (o) o.remove();
}
var _authMode = "login";
// 弹窗当前用途（发送验证码时用）：reset 视图发 reset 码，其余发 register 码
function getAuthPurpose() { return _authMode === "reset" ? "reset" : "register"; }
function switchAuthTab(mode) {
  _authMode = mode;
  var li = document.getElementById("authTabLogin");
  var ri = document.getElementById("authTabReg");
  var btn = document.getElementById("authSubmitBtn");
  var codeRow = document.getElementById("authCodeRow");
  var codeEl = document.getElementById("authCode");
  var errEl = document.getElementById("authErr");
  if (li) li.classList.toggle("active", mode === "login");
  if (ri) ri.classList.toggle("active", mode === "register");
  if (codeRow) codeRow.style.display = (mode === "register" || mode === "reset") ? "block" : "none";
  if (codeEl) codeEl.value = "";
  if (errEl) errEl.textContent = "";
  var title = document.querySelector("#authOverlay h2");
  if (title) title.textContent = mode === "reset" ? "🔑 重置密码" : (mode === "register" ? "👤 注册" : "👤 登录");
  if (btn) btn.textContent = mode === "reset" ? "重置密码" : (mode === "register" ? "注册并登录" : "登录");
}
function submitAuth() {
  // reset 模式走独立流程
  if (_authMode === "reset") { submitReset(); return; }
  var email = (document.getElementById("authEmail").value || "").trim();
  var pass = document.getElementById("authPass").value || "";
  var errEl = document.getElementById("authErr");
  var btn = document.getElementById("authSubmitBtn");
  if (!email || !pass) { errEl.textContent = "请输入邮箱和密码"; return; }
  if (_authMode === "register" && pass.length < 8) { errEl.textContent = "密码至少 8 位"; return; }
  var code = _authMode === "register" ? (document.getElementById("authCode").value || "").trim() : "";
  if (_authMode === "register" && !code) { errEl.textContent = "请先获取并输入邮箱验证码"; return; }
  errEl.textContent = "";
  btn.disabled = true;
  btn.textContent = _authMode === "login" ? "登录中…" : "注册中…";
  var p = _authMode === "login" ? doLogin(email, pass) : doRegister(email, pass, code);
  p.then(function() {
    closeAuthModal();
    showToast("✅ 已登录，云端同步完成");
  }).catch(function(e) {
    errEl.textContent = e.message || "操作失败";
    btn.disabled = false;
    btn.textContent = _authMode === "login" ? "登录" : "注册并登录";
  });
}

// 初始化：登录态 UI + 已登录则拉取同步
document.addEventListener("DOMContentLoaded", function() {
  updateAuthUI();
  if (isLoggedIn()) {
    setTimeout(function() { syncPullAll(); }, 500);
  }
});
