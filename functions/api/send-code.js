// functions/api/send-code.js — POST /api/send-code 发送邮箱验证码
// {email, purpose: "register"|"reset"} → {ok, dev?:code}
// - purpose=register：已注册邮箱拒绝（409，防重复注册骚扰）
// - purpose=reset：未注册邮箱统一返回 ok（防邮箱枚举）
// - 每 IP 10 分钟限 5 次；每邮箱 10 分钟限 1 次
import { json, issueCode, sendCodeEmail, rateLimit, clientIp } from "./_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  // 防滥用：每 IP 10 分钟 5 次
  if (!rateLimit("code:" + clientIp(request), 5, 10 * 60 * 1000)) {
    return json({ error: "发送过于频繁，请稍后再试" }, 429);
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "请求格式错误" }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const purpose = body.purpose === "reset" ? "reset" : "register";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "邮箱格式不正确" }, 400);

  const db = env.basic_korean_db;
  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();

  if (purpose === "register") {
    if (existing) return json({ error: "该邮箱已注册，可直接登录" }, 409);
    if (!rateLimit("code-email-reg:" + email, 1, 10 * 60 * 1000)) {
      return json({ error: "该邮箱发送过于频繁，请 10 分钟后再试" }, 429);
    }
  } else {
    // reset：无论是否注册都返回 ok（防邮箱枚举），仅真实注册用户发信。
    // 注意：未注册路径跳过 DB 写入与 Resend 请求，响应更快——存在理论时间侧信道，demo 规模可接受。
    // 限流 key 与 register 分开（code-email-rst），避免注册后立即重置密码被误伤。
    if (!existing) return json({ ok: true });
    if (!rateLimit("code-email-rst:" + email, 1, 10 * 60 * 1000)) {
      return json({ ok: true }); // 同样吞掉限流，防枚举
    }
  }

  const code = await issueCode(db, email, purpose);
  const mail = await sendCodeEmail(env, email, code, purpose);
  if (!mail.dev && !mail.ok) {
    return json({ error: "邮件发送失败，请稍后再试" }, 502);
  }
  // 本地开发回显验证码（前端自动填充供测试）——必须显式门控：仅 localhost 或显式 ALLOW_DEV_CODE="1"
  // 绝不能用「RESEND_API_KEY 缺失」隐式触发，否则生产忘记配置 secret 会把验证码泄露给任何人
  const host = request.headers.get("Host") || "";
  const isLocalDev = /^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(host);
  if (mail.dev) {
    if (isLocalDev || env.ALLOW_DEV_CODE === "1") {
      return json({ ok: true, dev: true, code });
    }
    return json({ error: "邮件服务未配置（RESEND_API_KEY）" }, 503);
  }
  return json({ ok: true });
}
