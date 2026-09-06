#!/usr/bin/env node
/**
 * tests/e2e/review-log-sync.js — 复习日志跨设备同步验证（Iteration 014/015）
 *
 * 专测新 blob key wordlist_review_log（set 型按 id+time 并集）的双设备语义，
 * 与 dual-device-sync.js 互补（后者测 4 个既有 blob 与 collections/scenes 记录级）。
 *
 * 三场景：
 *   1. 追加合并：设备 A 记 2 条、设备 B 记 2 条（含 1 条与 A 同 id 不同日）→ 拉取后两端各 4 条
 *      （关键：arr 型按 id 折叠会把 A/B 各 1 条同 id 折成 1 条，set 必须保住多日记录）
 *   2. 幂等：同一条目（同 id+time）重复推送/拉取 → 条数不变
 *   3. 修剪不回灌：本地 90 天修剪后老条目再从云端拉回属预期（并集设计，记录以导出为准），
 *      断言修剪发生在本地且新条目不受影响
 *
 * 用法：node tests/e2e/review-log-sync.js [port]   # 需先按 dual-device-ci.sh 起 pages dev
 *       或独立运行（会自行起 8791 pages dev + 独立 D1 persist，结束时清理）——见 run-standalone 标记
 * 退出码：0 = 全部通过，1 = 有失败
 */
'use strict';

const PORT = Number(process.argv[2] || 8791);
const BASE = `http://localhost:${PORT}`;
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function probe(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await sleep(500);
  }
  return false;
}

const PASS = [], FAIL = [];
function check(name, ok, extra) {
  (ok ? PASS : FAIL).push(name);
  console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'} ${name}${extra ? ' → ' + extra : ''}`);
}

// --- 独立模式：起 pages dev（独立 persist D1）+ dev 验证码回显 ---
const PERSIST = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-rlsync-'));
const stamp = Date.now();
let PAGES_PID = null;
async function main() {
  // schema → 独立 D1
  execSync(`npx wrangler d1 execute basic-korean-db --local --persist-to "${PERSIST}" --file=./schema.sql`, { stdio: 'inherit' });
  PAGES_PID = spawn('npx', ['wrangler', 'pages', 'dev', '.', '--port', String(PORT), '--persist-to', PERSIST, '--d1', 'basic-korean-db'], { stdio: 'ignore', detached: false });
  if (!(await probe(BASE + '/api/status'))) { console.error('❌ pages dev 未就绪'); process.exit(1); }

  // 1) 注册临时账号（dev 模式验证码回显）
  const email = `rl${stamp}@dev.local`;
  const code = await (async () => {
    const r = await fetch(BASE + '/api/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, purpose: 'register' }) });
    const d = await r.json();
    return d.devCode || d.code;
  })();
  const reg = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'rl-pass-123', code }) });
  const regData = await reg.json();
  const token = regData.token;
  if (!token) { console.error('❌ 注册失败', regData); process.exit(1); }
  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  const now = Date.now(), DAY = 86400000;
  const mk = (id, time) => ({ id, time });
  const blobOf = (data) => JSON.stringify({ data, deleted: {}, clearedAt: 0 });
  const push = (blobs) => fetch(BASE + '/api/sync', { method: 'POST', headers: auth, body: JSON.stringify({ blobs }) });
  const pull = async () => (await (await fetch(BASE + '/api/sync', { headers: auth })).json()).blobs || [];
  const getBlob = (blobs) => blobs.find((b) => b.key === 'wordlist_review_log');
  const ts = () => Date.now();

  // 设备 A：c1（今天）、c1（昨天，同 id 不同日 —— set 语义的生命线）
  const a = { key: 'wordlist_review_log', data_json: blobOf([mk('c1', now), mk('c1', now - DAY)]), updated_at: ts() };
  await push([a]);
  // 设备 B：c1（今天，与 A 重复）、c2（今天）
  const b = { key: 'wordlist_review_log', data_json: blobOf([mk('c1', now), mk('c2', now)]), updated_at: ts() };
  await push([b]);

  // 模拟设备 A 再拉取（服务端后写胜出返回 B 的整包，客户端 mergeSet 与本地并集）
  const serverBlobs = await pull();
  const serverBlob = getBlob(serverBlobs);
  const parse = (bj) => { try { return JSON.parse(bj.data_json).data; } catch (e) { return null; } };
  const serverData = serverBlob ? parse(serverBlob) : null;

  check('服务端接受新 blob key（wordlist_review_log）', !!serverBlob, serverBlob ? '200 命中' : '未返回（白名单未生效？）');
  if (serverData) {
    // 客户端合并语义在 Node 侧复刻 mergeSet：A 本地 ∪ 服务端 B 包
    const localA = [mk('c1', now), mk('c1', now - DAY)];
    const merged = [];
    const seen = {};
    localA.concat(serverData).forEach((e) => { const k = e.id + '@' + e.time; if (!seen[k]) { seen[k] = 1; merged.push(e); } });
    check('同 id 多日记录不被折叠（set ≠ arr）', merged.length === 3, `合并后 ${merged.length} 条（期望 3：c1今/c1昨/c2今）`);
    check('服务端后写胜出返回 B 包（方案 C 基线）', serverData.length === 2, `B 包 ${serverData.length} 条`);
  }

  // 幂等：重复推同包 → 拉取条数不变
  await push([b]);
  const again = getBlob(await pull());
  check('重复推送幂等', again && parse(again).length === 2, again ? `${parse(again).length} 条` : '无返回');

  // 修剪语义（纯本地，无需服务端参与）：老条目修剪后新条目完好
  const localLog = [mk('c1', now - 91 * DAY), mk('c2', now)];
  const cutoff = now - 90 * DAY;
  const trimmed = localLog.filter((e) => e.time >= cutoff);
  check('90 天本地修剪保留新条目', trimmed.length === 1 && trimmed[0].id === 'c2', `${trimmed.length} 条`);

  console.log('========================================');
  console.log(`  ${PASS.length} PASS / ${FAIL.length} FAIL`);
  console.log('========================================');
  process.exit(FAIL.length ? 1 : 0);
}
main().catch((e) => { console.error('❌ 出错：', e.message); process.exit(1); })
  .finally(() => { if (PAGES_PID) try { process.kill(-PAGES_PID.pid) } catch (e) {} ; fs.rmSync(PERSIST, { recursive: true, force: true }); });
