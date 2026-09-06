#!/usr/bin/env node
/**
 * tests/e2e/tts-cache-regression.js — 生产 TTS 四级回退链 + Cache API 缓存回归（Iteration 019）
 *
 * 背景：P1-9 已把「KV 缓存候选」实现为 Cache API（caches.default，免费、无需 KV 绑定），
 * STATE/设计文档的「Phase 4.5 候选」标注已过时。本脚本把该链固化成回归：
 *
 * 断言（本地 wrangler pages dev，独立 persist）：
 *   1. 参数校验：缺 text → 400；voice 含非法字符 → 400（SSML 注入白名单）
 *   2. 无配置 → 第 4 级降级 503 + hint + fallback: browser-speech-api（前端降级契约）
 *   3. EDGE_TTS_ENABLED=1（经 .dev.vars 注入——shell 环境变量 wrangler 不透传）→
 *      要么 200 audio/mpeg（本机出口能达 Edge 端点），要么 503 降级（workerd 出口被断，
 *      "Network connection lost"）——两者都是合法终态；若 200 则补验 Cache API 二次命中（更快 + 逐字节一致）
 *
 * ⚠️ 本地限制（Iteration 019 实测）：本机 workerd 的 WebSocket 到 speech.platform.bing.com
 * 会 "Network connection lost"（生产数据中心 IP 实测可达，设计文档 §3.9）。Edge 级的
 * 真实合成只在生产可信验证（curl 生产 /tts 或 test:selfcheck:prod）。本脚本守住其余契约。
 *
 * 用法：node tests/e2e/tts-cache-regression.js
 * 退出码：0 = 全过；1 = 有失败
 */
'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 8793;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASS = [], FAIL = [];
function check(name, ok, extra) {
  (ok ? PASS : FAIL).push(name);
  console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'} ${name}${extra ? ' → ' + extra : ''}`);
}
async function probe(url, tries = 90) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  return false;
}

// ---- 进程清理（Iteration 019 修正）----
// 教训：spawn 默认无进程组，process.kill(-pid) 杀不到任何东西；只杀 wrangler CLI 时
// 其 workerd 子进程可能残留并占端口，下一场景 bind 失败死循环。
// 正确姿势：pkill -P 树杀 → kill pid → lsof 清端口 → 轮询等端口真正释放。
const { spawn: _spawn } = require('child_process');
function sh(cmd) {
  try { return execSync(cmd, { shell: '/bin/bash', stdio: 'ignore' }).toString(); } catch (e) { return ''; }
}
async function killPagesDev(pid, port) {
  if (pid) {
    sh(`pkill -P ${pid} -9 2>/dev/null; kill -9 ${pid} 2>/dev/null; true`);
  }
  for (let i = 0; i < 12; i++) {
    sh(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null; true`);
    await sleep(1000);
    if (!sh(`lsof -ti tcp:${port}`).trim()) return;
  }
}

async function startPagesDev(persist, withEdge) {
  // ⚠️ shell 环境变量 wrangler pages dev 不透传给 worker（绑定清单可证），
  // 必须经 .dev.vars 文件注入；测试结束恢复原内容（文件已 gitignore）
  const DEVVARS = path.join(process.cwd(), '.dev.vars');
  const backup = fs.existsSync(DEVVARS) ? fs.readFileSync(DEVVARS, 'utf8') : null;
  try { fs.writeFileSync(DEVVARS, withEdge ? 'EDGE_TTS_ENABLED=1\n' : '# no-edge\n'); } catch (e) {}
  const pid = spawn('npx', ['wrangler', 'pages', 'dev', '.', '--port', String(PORT), '--persist-to', persist], { stdio: 'ignore' });
  const restore = () => { try { if (backup === null) fs.unlinkSync(DEVVARS); else fs.writeFileSync(DEVVARS, backup); } catch (e) {} };
  if (!(await probe(BASE + '/api/status'))) { restore(); throw new Error('pages dev 未就绪'); }
  pid._restoreDevVars = restore;
  return pid;
}

async function main() {
  // 场景 A：EDGE_TTS_ENABLED=1 → 第 3 级 Edge + Cache API
  const persistA = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-tts-a-'));
  let pidA = null;
  try {
    execSync(`npx wrangler d1 execute basic-korean-db --local --persist-to "${persistA}" --file=./schema.sql`, { stdio: 'inherit' });
    pidA = await startPagesDev(persistA, true);

    const text = encodeURIComponent('프로덕션 회귀 테스트 ' + Date.now());
    const url = `${BASE}/tts?text=${text}&voice=ko-KR-SunHiNeural`;

    // 1) 参数校验：缺 text → 400；voice 注入 → 400
    const noText = await fetch(`${BASE}/tts?voice=ko-KR-SunHiNeural`);
    const badVoice = await fetch(`${BASE}/tts?text=${text}&voice=${encodeURIComponent("x'); DROP")}`);
    check('缺 text 参数返回 400', noText.status === 400, String(noText.status));
    check('voice 白名单拦截非法字符（SSML 注入防护）', badVoice.status === 400, String(badVoice.status));

    // 2) Edge 级：两分支终态（本机出口能达 → 200 audio/mpeg；不能达 → 503 降级，均为合法契约）
    const t0 = Date.now();
    const r1 = await fetch(url);
    const ct1 = r1.headers.get('content-type') || '';
    const buf1 = Buffer.from(await r1.arrayBuffer());
    const ms1 = Date.now() - t0;
    if (r1.status === 200 && ct1.includes('audio/mpeg') && buf1.length > 1000) {
      check('Edge 免费级返回 audio/mpeg', true, `${buf1.length}B ${ms1}ms`);
      // Cache API 幂等命中：同 URL 二次更快 + 逐字节一致
      const t1 = Date.now();
      const r2 = await fetch(url);
      const buf2 = Buffer.from(await r2.arrayBuffer());
      const ms2 = Date.now() - t1;
      check('二次请求命中 Cache API（耗时显著下降）', ms2 < ms1 * 0.8 && ms2 < 500, `首回 ${ms1}ms / 缓存 ${ms2}ms`);
      check('缓存音频逐字节一致', buf1.equals(buf2), `${buf1.length}B === ${buf2.length}B`);
    } else if (r1.status === 503) {
      const body = JSON.parse(buf1.toString('utf8'));
      check('Edge 不可达时 503 降级契约（hint + fallback 标识）', body.fallback === 'browser-speech-api' && !!body.hint, JSON.stringify(body).slice(0, 80));
      note && console.log('  ℹ️ 本机 workerd 出口无法达 Edge 端点（生产实测可达，见脚本头注释）——缓存命中断言跳过');
    } else {
      check('Edge 级终态应为 200 audio/mpeg 或 503 降级', false, `得到 ${r1.status} ${ct1}`);
    }
  } finally {
    if (pidA && pidA._restoreDevVars) pidA._restoreDevVars();
    await killPagesDev(pidA, PORT);
    fs.rmSync(persistA, { recursive: true, force: true });
  }

  // 场景 B：无任何配置 → 第 4 级 503 + 降级提示（前端据此走 Web Speech API）
  const persistB = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-tts-b-'));
  let pidB = null;
  try {
    execSync(`npx wrangler d1 execute basic-korean-db --local --persist-to "${persistB}" --file=./schema.sql`, { stdio: 'inherit' });
    pidB = await startPagesDev(persistB, false);
    const r = await fetch(`${BASE}/tts?text=${encodeURIComponent('테스트')}&voice=ko-KR-SunHiNeural`);
    const body = await r.json().catch(() => ({}));
    check('无配置时第 4 级降级 503 + 提示', r.status === 503 && !!(body.hint || body.error), `${r.status} ${(body.hint || body.error || '').slice(0, 60)}`);
  } finally {
    if (pidB && pidB._restoreDevVars) pidB._restoreDevVars();
    await killPagesDev(pidB, PORT);
    fs.rmSync(persistB, { recursive: true, force: true });
  }

  console.log('========================================');
  console.log(`  ${PASS.length} PASS / ${FAIL.length} FAIL`);
  console.log('========================================');
  process.exit(FAIL.length ? 1 : 0);
}
main().catch((e) => { console.error('❌ 出错：', e.message); process.exit(1); });
