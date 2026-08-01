// functions/api/login.js — POST /api/login
// {email, password} → {token, userId}
import { json, hashPassword, dummyHash, ctEqual, createSession, rateLimit, clientIp } from "./_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  // 防爆破：每 IP 15 分钟最多 20 次登录尝试
  if (!rateLimit("login:" + clientIp(request), 20, 15 * 60 * 1000)) {
    return json({ error: "尝试过于频繁，请稍后再试" }, 429);
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "请输入邮箱和密码" }, 400);

  const db = env.basic_korean_db;
  const user = await db.prepare("SELECT id, pass_hash, salt FROM users WHERE email = ?").bind(email).first();
  if (!user) {
    // 跑一次假哈希抹平时序差，防邮箱枚举
    await dummyHash();
    return json({ error: "邮箱或密码错误" }, 401);
  }

  const hash = await hashPassword(password, user.salt);
  if (!ctEqual(hash, user.pass_hash)) return json({ error: "邮箱或密码错误" }, 401);

  const token = await createSession(db, user.id);
  return json({ token, userId: user.id, email });
}
