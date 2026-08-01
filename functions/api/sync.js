// functions/api/sync.js — 方案 C 同步（整包 + 智能合并，服务端只做后写胜出存储）
// GET  /api/sync (Bearer, ?since=ts) → {blobs:[{key,data_json,updated_at}], collections:[...]}
// POST /api/sync (Bearer, {blobs:[{key,data_json,updated_at}]}) → {ok, pushed}（后写胜出）
import { json, getSessionUser, BLOB_KEYS, migrateLegacySceneBlobs } from "./_shared.js";

const MAX_BLOB_BYTES = 2 * 1024 * 1024; // 单 blob 上限 2MB（防滥用）

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  // Phase 3 迁移钩子：旧版 custom_scenes / scene_history blob → scenes / scene_messages 记录级表（幂等）
  await migrateLegacySceneBlobs(env.basic_korean_db, user.userId);

  const since = Math.max(0, Number(new URL(request.url).searchParams.get("since") || 0));
  const db = env.basic_korean_db;

  const blobs = [];
  for (const key of BLOB_KEYS) {
    const row = await db.prepare("SELECT data_json, updated_at FROM user_blobs WHERE user_id = ? AND key = ? AND updated_at > ?")
      .bind(user.userId, key, since).first();
    if (row) blobs.push({ key, data_json: row.data_json, updated_at: row.updated_at });
  }
  const cols = await db.prepare("SELECT * FROM collections WHERE user_id = ? AND updated_at > ? ORDER BY updated_at DESC")
    .bind(user.userId, since).all();
  // Phase 3：返回记录级场景（custom=我的场景 / history=对话记录）
  const scenes = await db.prepare("SELECT * FROM scenes WHERE user_id = ? AND updated_at > ? ORDER BY updated_at DESC")
    .bind(user.userId, since).all();

  return json({ blobs, collections: cols.results, scenes: scenes.results });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const blobs = Array.isArray(body.blobs) ? body.blobs : [];
  if (blobs.length === 0) return json({ ok: true, pushed: 0 });

  const db = env.basic_korean_db;
  const now = Date.now();
  let pushed = 0;

  for (const b of blobs) {
    if (!b || typeof b.key !== "string" || !BLOB_KEYS.includes(b.key)) continue;
    if (typeof b.data_json !== "string") continue;
    if (b.data_json.length > MAX_BLOB_BYTES) return json({ error: "数据过大（单 key 上限 2MB）" }, 413);
    const ts = Math.max(0, Number(b.updated_at) || now);

    // 后写胜出：仅当传入 ts >= 现存 ts 才写入
    const existing = await db.prepare("SELECT updated_at FROM user_blobs WHERE user_id = ? AND key = ?")
      .bind(user.userId, b.key).first();
    if (existing && existing.updated_at > ts) continue;

    await db.prepare(
      "INSERT INTO user_blobs (user_id, key, data_json, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at"
    ).bind(user.userId, b.key, b.data_json, ts).run();
    pushed++;
  }

  return json({ ok: true, pushed });
}
