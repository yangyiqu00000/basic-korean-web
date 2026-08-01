// functions/api/scenes/[id]/messages.js — 临境对话消息（记录级，Phase 3）
// GET  /api/scenes/:id/messages (Bearer) → {messages:[...]}
// POST /api/scenes/:id/messages (Bearer, {role, content}) → {message}
import { json, getSessionUser, randomHex } from "../../_shared.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  const scene = await env.basic_korean_db.prepare("SELECT id FROM scenes WHERE id = ? AND user_id = ?")
    .bind(params.id, user.userId).first();
  if (!scene) return json({ error: "场景不存在" }, 404);

  const res = await env.basic_korean_db.prepare(
    "SELECT * FROM scene_messages WHERE scene_id = ? AND user_id = ? ORDER BY created_at ASC"
  ).bind(params.id, user.userId).all();
  return json({ messages: res.results });
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  const scene = await env.basic_korean_db.prepare("SELECT id FROM scenes WHERE id = ? AND user_id = ?")
    .bind(params.id, user.userId).first();
  if (!scene) return json({ error: "场景不存在" }, 404);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const role = body.role === "user" ? "user" : "assistant";
  const content = String(body.content || "").trim();
  if (!content) return json({ error: "消息内容不能为空" }, 400);

  const now = Date.now();
  const msgId = "m_" + randomHex(8);
  await env.basic_korean_db.prepare(
    "INSERT INTO scene_messages (id, scene_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(msgId, params.id, user.userId, role, content, now).run();

  const row = await env.basic_korean_db.prepare("SELECT * FROM scene_messages WHERE id = ?").bind(msgId).first();
  return json({ message: row });
}
