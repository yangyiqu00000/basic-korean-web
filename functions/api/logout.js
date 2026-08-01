// functions/api/logout.js — POST /api/logout (Bearer) → 204
import { json, sha256Hex } from "./_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.basic_korean_db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  // CORS 头统一由 _middleware.js 附加（域名白名单），此处不再手动设置
  return new Response(null, { status: 204 });
}
