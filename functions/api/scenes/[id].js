// functions/api/scenes/[id].js — DELETE /api/scenes/:id (Bearer) → 204（级联删消息）
import { json, getSessionUser } from "../_shared.js";

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  const db = env.basic_korean_db;
  const scene = await db.prepare("SELECT id FROM scenes WHERE id = ? AND user_id = ?")
    .bind(params.id, user.userId).first();
  if (!scene) return json({ error: "场景不存在" }, 404);

  // 级联删除该场景的全部消息，再删场景本身
  await db.prepare("DELETE FROM scene_messages WHERE scene_id = ? AND user_id = ?")
    .bind(params.id, user.userId).run();
  await db.prepare("DELETE FROM scenes WHERE id = ? AND user_id = ?")
    .bind(params.id, user.userId).run();

  return new Response(null, { status: 204 });
}
