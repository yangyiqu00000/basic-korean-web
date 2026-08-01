// functions/api/register.js — POST /api/register 开放注册（需邮箱验证码）
// {email, password, code} → {token, userId}
import { json, hashPassword, randomHex, createSession, rateLimit, clientIp, verifyCode } from "./_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  // 防垃圾注册：每 IP 每小时最多 10 次
  if (!rateLimit("reg:" + clientIp(request), 10, 3600 * 1000)) {
    return json({ error: "注册过于频繁，请稍后再试" }, 429);
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const code = String(body.code || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "邮箱格式不正确" }, 400);
  if (password.length < 8) return json({ error: "密码至少需要 8 位" }, 400);
  if (!code) return json({ error: "请先获取邮箱验证码" }, 400);

  const db = env.basic_korean_db;

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return json({ error: "该邮箱已注册" }, 409);

  // 邮箱验证码校验（一次性，10 分钟有效，只存哈希）
  const v = await verifyCode(db, email, "register", code);
  if (!v.ok) return json({ error: v.error }, v.status || 400);

  const salt = randomHex(16);
  const passHash = await hashPassword(password, salt);
  const userId = "u_" + randomHex(8);
  const now = Date.now();

  try {
    await db.prepare("INSERT INTO users (id, email, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(userId, email, passHash, salt, now).run();
  } catch (e) {
    // 唯一索引冲突（并发注册同一邮箱）→ 409
    if (String(e.message || "").includes("UNIQUE")) {
      return json({ error: "该邮箱已注册" }, 409);
    }
    return json({ error: "注册失败，请重试" }, 500);
  }

  const token = await createSession(db, userId);
  return json({ token, userId, email });
}
