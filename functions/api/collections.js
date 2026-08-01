// functions/api/collections.js — 词句表收藏（记录级，Phase 2 启用）
// GET  /api/collections (Bearer) → {items}
// POST /api/collections (Bearer, {item}) → {item}（按 user_id+type+text 幂等 upsert）
import { json, getSessionUser, randomHex } from "./_shared.js";

const VALID_TYPES = ["word", "sentence"];
const VALID_STATUS = ["new", "learning", "mastered"];
const VALID_SOURCES = ["skeleton", "training", "stems", "ai", "scene", "reference", "manual"];

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  const res = await env.basic_korean_db.prepare("SELECT * FROM collections WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(user.userId).all();
  return json({ items: res.results });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const item = body.item || body;
  const type = item.type;
  const text = String(item.text || "").trim();
  if (!VALID_TYPES.includes(type)) return json({ error: "type 必须是 word 或 sentence" }, 400);
  if (!text) return json({ error: "text 不能为空" }, 400);

  const now = Date.now();
  const db = env.basic_korean_db;

  const meaning = String(item.meaning ?? "");
  const source = VALID_SOURCES.includes(item.source) ? item.source : "manual";
  // 兼容前端 camelCase（sourceRef）与 snake_case（source_ref）两种字段名
  const sourceRef = String(item.source_ref ?? item.sourceRef ?? "");
  const status = VALID_STATUS.includes(item.status) ? item.status : "new";
  const note = String(item.note ?? "");

  // 幂等 upsert：按 (user_id, type, text) 唯一索引；已存在则保留最早来源（设计文档 §2.4）
  const existing = await db.prepare("SELECT id FROM collections WHERE user_id = ? AND type = ? AND text = ?")
    .bind(user.userId, type, text).first();

  let id;
  if (existing) {
    id = existing.id;
    // 已有记录：只更新 meaning/status/note（最新备注/状态），保留原 source/source_ref/created_at
    await db.prepare(
      "UPDATE collections SET meaning = ?, status = ?, note = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).bind(meaning, status, note, now, id, user.userId).run();
  } else {
    id = "c_" + randomHex(8);
    try {
      await db.prepare(
        "INSERT INTO collections (id, user_id, type, text, meaning, source, source_ref, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, user.userId, type, text, meaning, source, sourceRef, status, note, now, now).run();
    } catch (e) {
      // 唯一索引冲突（并发）：退化为更新，同样保留最早来源
      const dup = await db.prepare("SELECT id FROM collections WHERE user_id = ? AND type = ? AND text = ?")
        .bind(user.userId, type, text).first();
      if (dup) {
        id = dup.id;
        await db.prepare(
          "UPDATE collections SET meaning = ?, status = ?, note = ?, updated_at = ? WHERE id = ? AND user_id = ?"
        ).bind(meaning, status, note, now, id, user.userId).run();
      } else {
        return json({ error: "保存失败：" + e.message }, 500);
      }
    }
  }

  const row = await db.prepare("SELECT * FROM collections WHERE id = ?").bind(id).first();
  return json({ item: row });
}
