// functions/api/scenes.js — 临境场景（记录级，Phase 3）
// GET  /api/scenes (Bearer) → {scenes:[{id,title,prompt,kind,created_at,updated_at}]}
// POST /api/scenes (Bearer, {title, prompt, kind}) → {scene}  （kind 默认 custom）
import { json, getSessionUser, randomHex } from "./_shared.js";

const VALID_KINDS = ["custom", "history"];

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  let sql = "SELECT * FROM scenes WHERE user_id = ?";
  const params = [user.userId];
  if (kind && VALID_KINDS.includes(kind)) { sql += " AND kind = ?"; params.push(kind); }
  sql += " ORDER BY updated_at DESC";

  const res = await env.basic_korean_db.prepare(sql).bind(...params).all();
  return json({ scenes: res.results });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const title = String(body.title || "").trim();
  if (!title) return json({ error: "场景名称不能为空" }, 400);
  const prompt = String(body.prompt || "");
  const kind = VALID_KINDS.includes(body.kind) ? body.kind : "custom";
  const now = Date.now();
  const sceneId = "s_" + randomHex(8);

  // 幂等：custom 场景同 title 视为同一场景（更新 prompt）；history 对话存档必须每次新建（同名对话多次发生）
  const existing = kind === "custom"
    ? await env.basic_korean_db.prepare(
        "SELECT id FROM scenes WHERE user_id = ? AND kind = ? AND title = ?"
      ).bind(user.userId, kind, title).first()
    : null;

  let id;
  if (existing) {
    id = existing.id;
    await env.basic_korean_db.prepare(
      "UPDATE scenes SET prompt = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).bind(prompt, now, id, user.userId).run();
  } else {
    id = sceneId;
    try {
      await env.basic_korean_db.prepare(
        "INSERT INTO scenes (id, user_id, title, prompt, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, user.userId, title, prompt, kind, now, now).run();
    } catch (e) {
      // 并发冲突：退化为更新
      const dup = await env.basic_korean_db.prepare(
        "SELECT id FROM scenes WHERE user_id = ? AND kind = ? AND title = ?"
      ).bind(user.userId, kind, title).first();
      if (dup) {
        id = dup.id;
        await env.basic_korean_db.prepare(
          "UPDATE scenes SET prompt = ?, updated_at = ? WHERE id = ? AND user_id = ?"
        ).bind(prompt, now, id, user.userId).run();
      } else {
        return json({ error: "保存失败：" + e.message }, 500);
      }
    }
  }

  const row = await env.basic_korean_db.prepare("SELECT * FROM scenes WHERE id = ?").bind(id).first();

  // kind=history：可选批量消息（对话存档一次入库，避免 N+1）
  if (kind === "history" && Array.isArray(body.messages)) {
    const now2 = Date.now();
    for (const m of body.messages.slice(0, 200)) {
      if (!m || typeof m !== "object") continue;
      const role = m.role === "user" ? "user" : "assistant";
      const content = String(m.content || "").trim();
      if (!content) continue;
      await env.basic_korean_db.prepare(
        "INSERT INTO scene_messages (id, scene_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind("m_" + randomHex(8), id, user.userId, role, content, now2).run();
    }
  }

  return json({ scene: row });
}
