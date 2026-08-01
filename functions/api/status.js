// functions/api/status.js — Phase 2 D1 spike 演示端点
// 作用：① 验证 D1 绑定是否可用（读用户数）② 验证 PBKDF2 在 Workers 运行时可用（spike 关键探针）
// 访问：GET /api/status
export async function onRequest(context) {
  const { env } = context;
  const out = { ok: false, d1: false, pbkdf2: false };

  // 1) D1 探针
  try {
    if (env.basic_korean_db) {
      const res = await env.basic_korean_db.prepare('SELECT COUNT(*) AS c FROM users').first();
      out.d1 = true;
      out.userCount = res ? res.c : 0;
      // 额外列出表名，确认 schema 已应用
      const tables = await env.basic_korean_db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all();
      out.tables = tables.results.map(r => r.name);
    } else {
      out.d1Error = 'binding basic_korean_db not found';
    }
  } catch (e) {
    out.d1Error = e.message;
  }

  // 2) PBKDF2 探针（spike 核心验证：Web Crypto PBKDF2 在 workerd 是否可用）
  try {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode('spike-test-password'),
      { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
      keyMaterial, 256
    );
    const hashHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
    out.pbkdf2 = true;
    out.pbkdf2Iterations = 100000;
    out.pbkdf2HashLen = hashHex.length;
  } catch (e) {
    out.pbkdf2Error = e.message;
  }

  out.ok = out.d1 && out.pbkdf2;
  return new Response(JSON.stringify(out, null, 2), {
    status: out.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
