// functions/api/collections/[id].js — DELETE /api/collections/:id (Bearer) → 204
import { json, getSessionUser } from "../_shared.js";

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  const res = await env.basic_korean_db.prepare("DELETE FROM collections WHERE id = ? AND user_id = ?")
    .bind(params.id, user.userId).run();

  if (res.meta.changes === 0) return json({ error: "记录不存在" }, 404);
  // CORS 头统一由 _middleware.js 附加（域名白名单），此处不再手动设置
  return new Response(null, { status: 204 });
}
