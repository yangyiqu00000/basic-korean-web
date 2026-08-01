// functions/api/_shared.js — Phase 2 认证/同步共享工具
// 设计文档：docs/design/v2-upgrade-plan.md §3.3/§3.4
// 关键决策：
//  - 密码哈希用 PBKDF2（Web Crypto `crypto.subtle`，Workers 原生可用；scrypt 在 workerd 不可用）
//  - 会话 token 只存 sha256 哈希（库泄露也不泄露 token）
//  - 限流为进程内 Map（Pages Functions 多 isolate 下是尽力而为，demo 规模足够）

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 天
// 方案 C 同步的 blob key（Phase 3 起：custom_scenes / scene_history 迁出 blob，改走记录级 scenes / scene_messages 表）
export const BLOB_KEYS = ["progress", "training_done", "ai_history", "dismissed_tips"];
// 遗留 blob key（Phase 2 曾以整包同步）：拉取时迁移到记录级表后删除，实现墓碑兜底迁移
export const LEGACY_SCENE_BLOB_KEYS = ["custom_scenes", "scene_history"];

// ---------- 场景记录级迁移（Phase 3） ----------
// 旧版 custom_scenes / scene_history 以整包 JSON 存于 user_blobs，首次拉取时迁入 scenes / scene_messages 表，
// 迁移尊重墓碑（deleted 条目跳过、clearedAt 整体清空则跳过全部），完成后删除 blob 行（幂等：无 blob 则无操作）。
export async function migrateLegacySceneBlobs(db, userId) {
  try {
    await migrateLegacySceneBlobsInner(db, userId);
  } catch (e) {
    // 迁移失败不应阻断同步拉取（记录级数据仍可用）；下次拉取重试，避免 500
    console.error("migrateLegacySceneBlobs failed:", e && e.message);
  }
}

async function migrateLegacySceneBlobsInner(db, userId) {
  for (const key of LEGACY_SCENE_BLOB_KEYS) {
    const row = await db.prepare("SELECT data_json FROM user_blobs WHERE user_id = ? AND key = ?")
      .bind(userId, key).first();
    if (!row) continue;
    let parsed = null;
    try { parsed = JSON.parse(row.data_json); } catch (e) {}
    const data = parsed && parsed.data;
    const deleted = (parsed && parsed.deleted) || {};
    const clearedAt = (parsed && parsed.clearedAt) || 0;
    const now = Date.now();

    if (Array.isArray(data) && !clearedAt) {
      for (const item of data) {
        if (!item || typeof item !== "object") continue;
        const itemId = item.id || null;
        if (itemId && deleted[itemId]) continue; // 墓碑：已删除条目不迁移
        // 保留原始对话时间戳（历史对话聚到迁移当天会让 learning_days 失真）；无 time 则退回 now
        const t = Number(item.time) || now;
        if (key === "custom_scenes") {
          const sceneId = "s_" + randomHex(8);
          const title = String(item.title || "");
          if (!title) continue;
          await db.prepare(
            "INSERT INTO scenes (id, user_id, title, prompt, kind, created_at, updated_at) VALUES (?, ?, ?, ?, 'custom', ?, ?)"
          ).bind(sceneId, userId, title, String(item.prompt || ""), t, now).run();
        } else {
          // scene_history：每条对话 = 一个 history 场景 + 若干消息
          const sceneId = "s_" + randomHex(8);
          const title = String(item.title || "未命名对话");
          await db.prepare(
            "INSERT INTO scenes (id, user_id, title, prompt, kind, created_at, updated_at) VALUES (?, ?, ?, '', 'history', ?, ?)"
          ).bind(sceneId, userId, title, t, now).run();
          const msgs = Array.isArray(item.messages) ? item.messages : [];
          for (const m of msgs) {
            if (!m || typeof m !== "object") continue;
            const role = m.role === "user" ? "user" : "assistant";
            const content = String(m.kr || m.content || "");
            if (!content) continue;
            await db.prepare(
              "INSERT INTO scene_messages (id, scene_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
            ).bind("m_" + randomHex(8), sceneId, userId, role, content, t).run();
          }
        }
      }
    }
    // 迁移完成：删除 blob 行（含 clearedAt 整体清空的情况——清空语义已保留，无需迁移）
    await db.prepare("DELETE FROM user_blobs WHERE user_id = ? AND key = ?").bind(userId, key).run();
  }
}

// ---------- JSON 响应 / CORS ----------
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
// CORS 头（设计文档：仅放行站点自身域名 + 本地开发；由 _middleware.js 统一附加）
export function corsHeaders(request) {
  const origin = allowedOrigin(request ? request.headers.get("Origin") : null);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
// 域名白名单：本地开发 + 站点自身域名（含 *.pages.dev 预览与自定义域）
export function allowedOrigin(origin) {
  if (!origin) return null; // 同源请求（无 Origin 头）不需要 CORS 头
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return origin;
    if (host.endsWith(".pages.dev")) return origin;
    if (["korean.flowergod.top", "korean.gotflower.top", "flowergod.top", "gotflower.top"].includes(host)) return origin;
  } catch (e) {}
  return null;
}

// ---------- 字节/十六进制 ----------
function bytesToHex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(hex) {
  const u = new Uint8Array(hex.length / 2);
  for (let i = 0; i < u.length; i++) u[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return u;
}
export function randomHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}
export async function sha256Hex(str) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", enc.encode(str)));
}

// ---------- PBKDF2 密码哈希（Web Crypto，Workers 原生） ----------
export async function hashPassword(password, saltHex) {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS },
    keyMaterial, 256
  );
  return bytesToHex(bits);
}
// 常数时间比较（防时序攻击）
export function ctEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// 预生成固定盐的"假哈希"：用户不存在时也跑一次 PBKDF2，抹平登录响应时序差（防邮箱枚举）
export async function dummyHash() {
  await hashPassword("dummy-password-for-timing", "00000000000000000000000000000000");
}

// ---------- 会话 ----------
export async function createSession(db, userId) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, now + SESSION_TTL_MS, now).run();
  return token;
}
export async function getSessionUser(db, request) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    "SELECT s.user_id, s.expires_at, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?"
  ).bind(tokenHash).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    // 顺手清理过期 session，避免表膨胀
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  // 滑动续期：剩余 < 15 天则续到 30 天
  if (row.expires_at - Date.now() < SESSION_TTL_MS / 2) {
    await db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?")
      .bind(Date.now() + SESSION_TTL_MS, tokenHash).run();
  }
  return { userId: row.user_id, email: row.email };
}

// ---------- 邮箱验证码（防垃圾注册 + 密码重置） ----------
// 只存 sha256(code) 哈希；一次性使用；10 分钟过期；每邮箱 10 分钟限发 1 次
const CODE_TTL_MS = 10 * 60 * 1000;
export function generateCode() {
  // CSPRNG：验证码必须用 crypto.getRandomValues，Math.random 强度不保证
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String((a[0] % 900000) + 100000); // 6 位数字
}
// 发送验证码邮件（Resend API）。未配置 RESEND_API_KEY（本地开发）时返回 dev=true，不真实发信。
export async function sendCodeEmail(env, to, code, purpose) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { dev: true }; // 本地无 key：调用方应把 code 放响应里供测试
  const subject = purpose === "reset" ? "重置密码验证码" : "注册验证码";
  const tpl = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
      <h2 style="margin:0 0 8px;color:#111827;">${subject}</h2>
      <p style="color:#4b5563;font-size:15px;line-height:1.6;">
        你的验证码是：
      </p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;">${code}</div>
      <p style="color:#9ca3af;font-size:13px;margin-top:16px;">验证码 10 分钟内有效，请勿转发给他人。如果这不是你的操作，请忽略此邮件。</p>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      from: env.RESEND_FROM || "Basic Korean <onboarding@resend.dev>",
      to: [to],
      subject,
      html: tpl
    })
  });
  return { dev: false, ok: res.ok, status: res.status };
}

// 生成并入库验证码（同一邮箱+用途的旧码先失效），返回明文 code（仅用于响应/发信）
export async function issueCode(db, email, purpose) {
  const code = generateCode();
  const codeHash = await sha256Hex(code);
  const now = Date.now();
  // 失效该邮箱+用途的旧码（一次性语义），并清理该邮箱的过期/已用码（防表无限膨胀）
  await db.prepare("UPDATE email_codes SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL")
    .bind(now, email, purpose).run();
  await db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ? AND (expires_at < ? OR used_at IS NOT NULL)")
    .bind(email, purpose, now).run();
  await db.prepare("INSERT INTO email_codes (id, email, purpose, code_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)")
    .bind("v_" + randomHex(8), email, purpose, codeHash, now + CODE_TTL_MS, now).run();
  return code;
}
// 校验验证码（一次性消费，原子）：单条 UPDATE 带 used_at IS NULL + expires_at 条件，
// 以 meta.changes 判定是否命中——并发同码请求只有一方能消费成功（消除 SELECT→UPDATE 的 TOCTOU 竞态）
// 返回 {ok} 或 {error, status}
export async function verifyCode(db, email, purpose, code) {
  const codeStr = String(code || "").trim();
  if (!/^\d{6}$/.test(codeStr)) return { error: "验证码格式不正确（6 位数字）", status: 400 };
  const codeHash = await sha256Hex(codeStr);
  const now = Date.now();
  const res = await db.prepare(
    "UPDATE email_codes SET used_at = ? WHERE email = ? AND purpose = ? AND code_hash = ? AND used_at IS NULL AND expires_at > ?"
  ).bind(now, email, purpose, codeHash, now).run();
  if (res && res.meta && res.meta.changes > 0) return { ok: true };
  // 未命中：区分「不存在 / 已用 / 过期」以给出准确提示
  const row = await db.prepare(
    "SELECT used_at, expires_at FROM email_codes WHERE email = ? AND purpose = ? AND code_hash = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(email, purpose, codeHash).first();
  if (!row) return { error: "验证码错误", status: 400 };
  if (row.used_at) return { error: "验证码已使用，请重新获取", status: 400 };
  if (row.expires_at <= now) return { error: "验证码已过期，请重新获取", status: 400 };
  return { error: "验证码错误", status: 400 };
}

// ---------- 限流（进程内，尽力而为） ----------
const rateBuckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (rateBuckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}
export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}
