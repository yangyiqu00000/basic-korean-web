// functions/api/reset-password.js — POST /api/reset-password 密码重置
// {email, code, newPassword} → {ok}
// - 先校验邮箱验证码（purpose=reset，一次性）
// - 重置后该用户全部会话立即失效（防被盗用旧 token）
import { json, verifyCode, hashPassword, randomHex, rateLimit, clientIp } from "./_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!rateLimit("reset:" + clientIp(request), 5, 60 * 60 * 1000)) {
    return json({ error: "操作过于频繁，请稍后再试" }, 429);
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const code = String(body.code || "").trim();
  const newPassword = String(body.newPassword || "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "邮箱格式不正确" }, 400);
  if (newPassword.length < 8) return json({ error: "新密码至少需要 8 位" }, 400);
  if (!code) return json({ error: "请先获取验证码" }, 400);

  const db = env.basic_korean_db;

  // 验证码校验（一次性）
  const v = await verifyCode(db, email, "reset", code);
  if (!v.ok) return json({ error: v.error }, v.status || 400);

  const user = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (!user) return json({ error: "该邮箱未注册" }, 404);

  const salt = randomHex(16);
  const passHash = await hashPassword(newPassword, salt);
  await db.prepare("UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?")
    .bind(passHash, salt, user.id).run();
  // 密码已改：撤销该用户全部会话
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();

  return json({ ok: true });
}
