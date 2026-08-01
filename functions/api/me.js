// functions/api/me.js — GET /api/me (Bearer)
// → {userId, email, blobs:{...}, collections}
import { json, getSessionUser, BLOB_KEYS, migrateLegacySceneBlobs } from "./_shared.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  // Phase 3 迁移钩子：旧 blob → 记录级 scenes（幂等）
  await migrateLegacySceneBlobs(env.basic_korean_db, user.userId);

  const db = env.basic_korean_db;
  const blobs = {};
  for (const key of BLOB_KEYS) {
    const row = await db.prepare("SELECT data_json, updated_at FROM user_blobs WHERE user_id = ? AND key = ?")
      .bind(user.userId, key).first();
    if (row) blobs[key] = { data_json: row.data_json, updated_at: row.updated_at };
  }
  const cols = await db.prepare("SELECT * FROM collections WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(user.userId).all();
  const scenes = await db.prepare("SELECT * FROM scenes WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(user.userId).all();

  return json({ userId: user.userId, email: user.email, blobs, collections: cols.results, scenes: scenes.results });
}
