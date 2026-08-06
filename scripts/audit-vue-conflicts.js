#!/usr/bin/env node
/**
 * scripts/audit-vue-conflicts.js — Vue 模式冲突静态审计（零依赖，Node 内置模块）
 *
 * 背景：页面以 Vue 3 挂载到 #mainContent 内的 #vue-root 上。任何代码若直接写
 *   document.getElementById("mainContent").innerHTML = ...（或外层容器 .innerHTML）
 *   会把 #vue-root（Vue 挂载点）一并删除，导致全部导航失效；同理 navigate(当前页)
 *   在 Vue 模式下 currentPage 值不变不会重渲染（历史真实事故：refreshChatUI / 复习页 /
 *   clearData / 保存删除自定义场景）。
 *
 * 本脚本扫描 js/app.js、js/vue-app.js、js/components/*.js，检测三类危险模式：
 *   CRITICAL — 未受 Vue guard 保护的 #mainContent / #vue-root 直接 innerHTML 写入
 *   WARNING  — navigate(当前页) 同页导航、或疑似同页导航（改数据后 navigate 到本页）
 *   OK/INFO  — 受保护的写入（Vue 分支提前 return / 组件根节点定向）及全部 navigate 调用点
 *
 * 用法：
 *   node scripts/audit-vue-conflicts.js             # 扫描，有 CRITICAL 时 exit 1
 *   node scripts/audit-vue-conflicts.js --json      # 机器可读输出
 *   node scripts/audit-vue-conflicts.js --fail-on-warning  # WARNING 也视为失败(exit 2)
 *   node scripts/audit-vue-conflicts.js --selftest  # 内部自测（注入已知坏例验证检测）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILES = [
  'js/app.js',
  'js/vue-app.js',
  'js/components/HomePage.js',
  'js/components/SkeletonPage.js',
  'js/components/TrainingPage.js',
  'js/components/StemsPage.js',
  'js/components/AiPage.js',
  'js/components/ScenePage.js',
  'js/components/SchedulePage.js',
  'js/components/ReferencePage.js'
];

// 页面关键字（用于同页导航启发式：函数名含该关键字且 navigate 到同名页）
const PAGE_KEYWORDS = ['scene', 'training', 'home', 'skeleton', 'stems', 'ai', 'schedule'];

/* ---------------- 代码掩码：注释掩空，字符串/模板保留但标记非代码区 ---------------- */

/**
 * 返回 { masked, codeFlag }：
 *   masked   — 注释内容替换为空格（保留换行），字符串/模板字面量原样保留；
 *   codeFlag — 等长布尔数组，true = 该字符位于可执行代码区（非注释/字符串/模板）。
 *
 * 设计要点：检测正则（如 getElementById("mainContent") / navigate("scene")）需要看到
 * 字符串内容本身，所以字符串不能掩空；但又不能让 render 函数模板串里的
 * onclick="navigate('home')" 之类误报——因此匹配时必须要求命中点 codeFlag=true。
 */
function maskSource(src) {
  const out = src.split('');
  const codeFlag = new Array(src.length).fill(false);
  let state = 'code'; // code | lineComment | blockComment | str | tpl
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const nxt = src[i + 1];
    if (state === 'code') {
      if (c === '/' && nxt === '/') { state = 'lineComment'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === '/' && nxt === '*') { state = 'blockComment'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === '"' || c === "'") { state = 'str'; i += 1; continue; }
      if (c === '`') { state = 'tpl'; i += 1; continue; }
      codeFlag[i] = true;
      i += 1; continue;
    }
    if (state === 'lineComment') {
      if (c === '\n') state = 'code';
      else out[i] = ' ';
      i += 1; continue;
    }
    if (state === 'blockComment') {
      if (c === '*' && nxt === '/') { state = 'code'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === '\n') { /* 保留换行 */ } else out[i] = ' ';
      i += 1; continue;
    }
    if (state === 'str') {
      if (c === '\\') { i += 2; continue; }
      if (c === '"' || c === "'") { state = 'code'; i += 1; continue; }
      if (c === '\n') { /* 未闭合字符串，按行继续 */ state = 'code'; i += 1; continue; }
      i += 1; continue;
    }
    if (state === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { state = 'code'; i += 1; continue; }
      if (c === '\n') { i += 1; continue; }
      i += 1; continue;
    }
    i += 1;
  }
  return { masked: out.join(''), codeFlag };
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/**
 * 在 masked 上执行全局正则，仅返回命中点落在代码区（codeFlag=true）的结果。
 * 同时 yield 时同步推进 lastIndex，避免跨调用共享 lastIndex 的经典坑。
 */
function* codeMatches(masked, codeFlag, reSource) {
  const rx = new RegExp(reSource.source, 'g');
  let m;
  while ((m = rx.exec(masked)) !== null) {
    if (codeFlag[m.index]) yield m;
  }
}

/* ---------------- 函数边界识别（括号配对，用于判断所属函数） ---------------- */

function findFunctions(masked, codeFlag) {
  const funcs = [];
  for (const m of codeMatches(masked, codeFlag, /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/)) {
    const name = m[1];
    const start = m.index;
    // 找函数体第一个 '{'（仅代码区）
    let braceIdx = -1;
    for (let j = m.index + m[0].length; j < masked.length; j++) {
      if (masked[j] === '{' && codeFlag[j]) { braceIdx = j; break; }
    }
    if (braceIdx === -1) continue;
    // 括号配对（仅计数代码区的花括号，模板字符串里的 ${} 不参与）
    let depth = 0;
    let end = -1;
    for (let j = braceIdx; j < masked.length; j++) {
      if (!codeFlag[j]) continue;
      if (masked[j] === '{') depth++;
      else if (masked[j] === '}') {
        depth--;
        if (depth === 0) { end = j; break; }
      }
    }
    if (end === -1) continue;
    funcs.push({ name, start, end });
  }
  return funcs;
}

function enclosingFunction(funcs, idx) {
  let best = null;
  for (const f of funcs) {
    if (idx >= f.start && idx <= f.end) {
      if (!best || (f.end - f.start) < (best.end - best.start)) best = f;
    }
  }
  return best;
}

/* ---------------- 模式检测 ---------------- */

const RE_MAINCONTENT_DIRECT = /document\.getElementById\(\s*["']mainContent["']\s*\)\s*\.\s*innerHTML\s*=/;
const RE_VUEROOT_DIRECT = /document\.getElementById\(\s*["']vue-root["']\s*\)\s*\.\s*(innerHTML|outerHTML|textContent|replaceChildren|removeChild|replaceWith)\s*=/;
const RE_MAINCONTENT_ALIAS_DECL = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*\s*\|\|\s*)?document\.getElementById\(\s*["']mainContent["']\s*\)/;
const RE_NAVIGATE = /navigate\(\s*["']([^"']+)["']\s*\)/;
const RE_NAVIGATE_CURRENTPAGE = /navigate\(\s*currentPage\s*\)/;
const RE_RETURN = /\breturn\b/;

/**
 * 判断 mainContent 写入点是否受保护：
 * 1) 若写入目标来自 `var x = root || document.getElementById("mainContent")`（组件根节点定向）→ 安全
 * 2) 若所属函数在写入点之前有 window.vueApp 检查且带 return（传统模式回退）→ 安全
 * 3) 否则 → 危险（CRITICAL）
 *
 * 注意：guard 窗口必须切片到【实际写入点 writeIdx】，而非别名声明点——
 * 否则 navigate() 里 setTimeout 回调内的只读 `var main = getElementById("mainContent")`
 * 会命中别名规则并把已受保护的写入误报为 CRITICAL；直接写入路径切片到 0 则永远判定无 guard。
 *
 * 局限（启发式而非精确证明）：写入点之前出现的任何 return 都被视为保护，即使该 return
 * 与 Vue 模式无关（如 `if (something) { window.vueApp.x(); return; }` 后接未保护写入）。
 * 作为 lint 提示足够，误报代价低。
 */
function classifyMainContentWrite(masked, codeFlag, funcs, aliasVar, writeIdx) {
  // 情况 1：别名声明行包含 "root ||" 组件根节点定向模式
  if (aliasVar && /=\s*[A-Za-z_$][\w$]*\s*\|\|\s*document\.getElementById/.test(aliasVar.fullLine)) {
    return { level: 'OK', reason: '组件根节点定向（root || mainContent），Vue 模式下写入 .*-vue 根节点，安全' };
  }
  const f = enclosingFunction(funcs, writeIdx);
  if (!f) return { level: 'CRITICAL', reason: '无法定位所属函数，存在覆盖 #vue-root 风险' };
  // 只检查写入点之前的部分（避免把写入点之后的 window.vueApp 误当 guard）
  const bodyBefore = masked.slice(f.start, writeIdx);
  const guardIdx = bodyBefore.lastIndexOf('window.vueApp');
  if (guardIdx !== -1) {
    const between = masked.slice(f.start + guardIdx, writeIdx);
    if (RE_RETURN.test(between)) {
      return { level: 'OK', reason: '所属函数含 window.vueApp guard + return（传统模式回退分支），Vue 模式下提前返回，安全' };
    }
  }
  return { level: 'CRITICAL', reason: '未受 Vue guard 保护：Vue 模式下会连同 #vue-root 一起删除，导航全部失效' };
}

/**
 * 审计单个文件。返回 findings: [{file, line, level, kind, snippet, reason}]
 */
function auditFile(filePath, src) {
  const { masked, codeFlag } = maskSource(src);
  const funcs = findFunctions(masked, codeFlag);
  const findings = [];

  // 1) vue-root 直接写入（最危险）
  for (const m of codeMatches(masked, codeFlag, RE_VUEROOT_DIRECT)) {
    findings.push({
      file: filePath, line: lineOf(src, m.index), level: 'CRITICAL', kind: 'vue-root 直接写入',
      snippet: src.slice(m.index, m.index + 60).replace(/\n/g, ' ').trim(),
      reason: '直接修改 #vue-root（Vue 挂载点）DOM，会摧毁整个 Vue 应用'
    });
  }

  // 2) mainContent 直接 innerHTML 写入
  for (const m of codeMatches(masked, codeFlag, RE_MAINCONTENT_DIRECT)) {
    const cls = classifyMainContentWrite(masked, codeFlag, funcs, null, m.index);
    findings.push({
      file: filePath, line: lineOf(src, m.index), level: cls.level, kind: 'mainContent.innerHTML',
      snippet: src.slice(m.index, m.index + 60).replace(/\n/g, ' ').trim(),
      reason: cls.reason
    });
  }

  // 3) mainContent 别名 innerHTML 写入（var/let/const x = getElementById("mainContent") 之后 x.innerHTML =）
  const aliasDecls = [];
  for (const m of codeMatches(masked, codeFlag, RE_MAINCONTENT_ALIAS_DECL)) {
    aliasDecls.push({ varName: m[1], idx: m.index, fullLine: src.slice(m.index, m.index + 120).replace(/\n/g, ' ').trim() });
  }
  for (const a of aliasDecls) {
    const f = enclosingFunction(funcs, a.idx);
    if (!f) continue;
    const re = new RegExp('\\b' + a.varName + '\\s*\\.\\s*innerHTML\\s*=');
    const w = re.exec(masked.slice(a.idx + 1, f.end + 1));
    if (!w) continue;
    const absIdx = a.idx + 1 + w.index;
    if (!codeFlag[absIdx]) continue; // 命中点必须落在代码区
    const cls = classifyMainContentWrite(masked, codeFlag, funcs, a, absIdx);
    findings.push({
      file: filePath, line: lineOf(src, absIdx), level: cls.level, kind: 'mainContent 别名 innerHTML',
      snippet: src.slice(absIdx, absIdx + 60).replace(/\n/g, ' ').trim(),
      reason: cls.reason + '（别名 ' + a.varName + '）'
    });
  }

  // 4) navigate(当前页) — 同页导航（Vue 下不重渲染），refreshCurrentPage 内部允许
  for (const m of codeMatches(masked, codeFlag, RE_NAVIGATE_CURRENTPAGE)) {
    const f = enclosingFunction(funcs, m.index);
    const fnName = f ? f.name : '(top-level)';
    if (fnName === 'refreshCurrentPage') continue; // 已封装：Vue 分支 refreshPage，传统分支才 navigate
    const bodyBefore = f ? masked.slice(f.start, m.index) : '';
    const guardIdx = bodyBefore.lastIndexOf('window.vueApp');
    const guarded = guardIdx !== -1 && RE_RETURN.test(masked.slice(f.start + guardIdx, m.index));
    findings.push({
      file: filePath, line: lineOf(src, m.index),
      level: guarded ? 'OK' : 'WARNING', kind: 'navigate(当前页)',
      snippet: src.slice(m.index, m.index + 60).replace(/\n/g, ' ').trim(),
      reason: guarded
        ? '含 Vue guard（传统模式回退），安全'
        : '同页导航：Vue 模式下 currentPage 值不变不重渲染，改数据后界面不更新。应改用 refreshCurrentPage()'
    });
  }

  // 5) navigate("静态页") — 启发式：改数据函数 + 函数名含目标页关键字 → 疑似同页导航
  for (const m of codeMatches(masked, codeFlag, RE_NAVIGATE)) {
    const target = m[1];
    const f = enclosingFunction(funcs, m.index);
    const fnName = f ? f.name : '(top-level)';
    const fnLower = fnName.toLowerCase();
    const targetLower = target.toLowerCase();
    const isSceneSwitch = (fnName === 'startSceneChat' && target === 'sceneChat') ||
                          (fnName === 'exitSceneChat' && target === 'scene') ||
                          fnName === 'jumpToRule' || fnName === 'navigate';
    if (isSceneSwitch) {
      findings.push({ file: filePath, line: lineOf(src, m.index), level: 'OK', kind: 'navigate(静态页)', snippet: src.slice(m.index, m.index + 60).replace(/\n/g, ' ').trim(), reason: '跨页导航（' + fnName + ' → ' + target + '），正常' });
      continue;
    }
    const pageHit = PAGE_KEYWORDS.some(k => targetLower === k && fnLower.includes(k));
    const mutatesData = /\blocalStorage\.(setItem|removeItem)\b/.test(masked.slice(f ? f.start : 0, f ? f.end : masked.length));
    if (pageHit && mutatesData) {
      findings.push({
        file: filePath, line: lineOf(src, m.index), level: 'WARNING', kind: '疑似同页 navigate',
        snippet: src.slice(m.index, m.index + 60).replace(/\n/g, ' ').trim(),
        reason: '函数 ' + fnName + ' 修改了 localStorage 后 navigate("' + target + '")——若当前页即 ' + target + '，Vue 下不重渲染。应改用 refreshCurrentPage()'
      });
    } else {
      findings.push({
        file: filePath, line: lineOf(src, m.index), level: 'INFO', kind: 'navigate(静态页)',
        snippet: src.slice(m.index, m.index + 60).replace(/\n/g, ' ').trim(),
        reason: fnName + '() → ' + target + '（跨页或受控导航，人工复核）'
      });
    }
  }

  // 按 (line, kind) 去重，保留严重级别最高的一条（如 navigate() 内两个别名声明命中同一写入点）
  const seen = new Map();
  const order = { CRITICAL: 0, WARNING: 1, OK: 2, INFO: 3 };
  for (const f of findings) {
    const key = f.line + '|' + f.kind;
    const prev = seen.get(key);
    if (!prev || order[f.level] < order[prev.level]) seen.set(key, f);
  }
  return Array.from(seen.values()).sort((a, b) => a.line - b.line);
}

/* ---------------- 输出 ---------------- */

function printReport(findings, opts) {
  if (opts.json) {
    console.log(JSON.stringify({ findings }, null, 2));
    return;
  }
  const order = { CRITICAL: 0, WARNING: 1, OK: 2, INFO: 3 };
  const sorted = findings.slice().sort((a, b) => order[a.level] - order[b.level] || a.line - b.line);
  let lastFile = null;
  for (const f of sorted) {
    if (f.file !== lastFile) {
      console.log('\n📄 ' + f.file);
      lastFile = f.file;
    }
    const tag = f.level === 'CRITICAL' ? '🔴 CRITICAL' : f.level === 'WARNING' ? '🟡 WARNING' : f.level === 'OK' ? '🟢 OK' : 'ℹ️ INFO';
    console.log('  L' + String(f.line).padEnd(5) + tag.padEnd(11) + ' [' + f.kind + ']');
    console.log('        ' + f.snippet);
    console.log('        💡 ' + f.reason);
  }
}

function summarize(findings) {
  const c = findings.filter(f => f.level === 'CRITICAL').length;
  const w = findings.filter(f => f.level === 'WARNING').length;
  const ok = findings.filter(f => f.level === 'OK').length;
  const info = findings.filter(f => f.level === 'INFO').length;
  return { CRITICAL: c, WARNING: w, OK: ok, INFO: info };
}

/* ---------------- 自测模式：注入已知坏例验证检测 ---------------- */

function selftest() {
  let pass = 0, fail = 0;
  const check = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };

  // 坏例 1：未受保护直接写 mainContent
  const bad1 = [
    'function foo() {',
    '  var main = document.getElementById("mainContent");',
    '  main.innerHTML = "<div>bad</div>";',
    '}'
  ].join('\n');
  let f1 = auditFile('selftest.js', bad1);
  check('坏例1：未保护 mainContent 别名写入 → CRITICAL', f1.some(x => x.level === 'CRITICAL' && x.kind === 'mainContent 别名 innerHTML'));

  // 坏例 2：vue-root 直接写入
  const bad2 = 'document.getElementById("vue-root").innerHTML = "x";';
  check('坏例2：vue-root 直接写入 → CRITICAL', auditFile('selftest.js', bad2).some(x => x.level === 'CRITICAL' && x.kind === 'vue-root 直接写入'));

  // 坏例 3：navigate(currentPage) 无 guard
  const bad3 = 'function clearData() { localStorage.removeItem("k"); navigate(currentPage); }';
  check('坏例3：navigate(当前页) 无 guard → WARNING', auditFile('selftest.js', bad3).some(x => x.level === 'WARNING' && x.kind === 'navigate(当前页)'));

  // 坏例 4：改数据 + navigate 到函数名同页
  const bad4 = 'function saveCustomScene() { localStorage.setItem("k", "v"); navigate("scene"); }';
  check('坏例4：saveCustomScene 改数据后 navigate("scene") → WARNING', auditFile('selftest.js', bad4).some(x => x.level === 'WARNING' && x.kind === '疑似同页 navigate'));

  // 坏例 5：let 别名写入（旧正则漏掉 let）
  const bad5 = [
    'function foo() {',
    '  let main = document.getElementById("mainContent");',
    '  main.innerHTML = "<div>bad</div>";',
    '}'
  ].join('\n');
  check('坏例5：let 别名写入 → CRITICAL', auditFile('selftest.js', bad5).some(x => x.level === 'CRITICAL'));

  // 好例 1：带 Vue guard 的传统模式回退
  const good1 = [
    'function refreshChatUI() {',
    '  if (window.vueApp && typeof window.vueApp.refreshSceneChat === "function") {',
    '    window.vueApp.refreshSceneChat();',
    '    return;',
    '  }',
    '  var main = document.getElementById("mainContent");',
    '  main.innerHTML = renderSceneChat();',
    '}'
  ].join('\n');
  let g1 = auditFile('selftest.js', good1);
  check('好例1：带 guard 的 mainContent 写入 → 不报 CRITICAL 且报 OK', !g1.some(x => x.level === 'CRITICAL') && g1.some(x => x.level === 'OK' && x.kind === 'mainContent 别名 innerHTML'));

  // 好例 2：组件根节点定向（root || mainContent）
  const good2 = [
    'function setTrainingFilter() {',
    '  var root = document.querySelector("#mainContent .training-page-vue");',
    '  var main = root || document.getElementById("mainContent");',
    '  main.innerHTML = renderTraining();',
    '}'
  ].join('\n');
  let g2 = auditFile('selftest.js', good2);
  check('好例2：root || mainContent 组件根节点定向 → 不报 CRITICAL', !g2.some(x => x.level === 'CRITICAL'));

  // 好例 3：refreshCurrentPage 内的 navigate(currentPage)
  const good3 = 'function refreshCurrentPage() { if (window.vueApp && typeof window.vueApp.refreshPage === "function") { window.vueApp.refreshPage(); return; } navigate(currentPage); }';
  check('好例3：refreshCurrentPage 内 navigate(currentPage) → 不报 WARNING', !auditFile('selftest.js', good3).some(x => x.kind === 'navigate(当前页)'));

  // 好例 4：跨页导航不误报
  const good4 = 'function exitSceneChat() { sceneChatState.active = false; navigate("scene"); }';
  check('好例4：exitSceneChat → navigate("scene") 跨页不误报', !auditFile('selftest.js', good4).some(x => x.level === 'WARNING'));

  // 好例 5：受保护的【直接】写入（非别名）→ 不报 CRITICAL
  const good5 = [
    'function nav() {',
    '  if (window.vueApp && typeof window.vueApp.navigate === "function") {',
    '    window.vueApp.navigate("x");',
    '    return;',
    '  }',
    '  document.getElementById("mainContent").innerHTML = renderPage("x");',
    '}'
  ].join('\n');
  check('好例5：受保护直接写入 → 不报 CRITICAL', !auditFile('selftest.js', good5).some(x => x.level === 'CRITICAL'));

  // 好例 6：模板字符串里的 onclick="navigate('x')" 不应被识别为 JS navigate 调用（掩码生效）
  const good6 = 'function renderHome() { return `<div onclick="navigate(\'home\')">x</div>`; }';
  check('好例6：模板字符串内 onclick navigate 不误报', !auditFile('selftest.js', good6).some(x => x.kind === 'navigate(静态页)' || x.kind === 'navigate(当前页)'));

  // 金样测试：真实代码库（全部默认文件）不应有 CRITICAL / WARNING
  // （若出现说明 guard 检测有误报或引入了同类回归）
  let goldenC = 0, goldenW = 0;
  for (const gf of DEFAULT_FILES) {
    const gp = path.join(ROOT, gf);
    if (!fs.existsSync(gp)) continue;
    const realFindings = auditFile(gf, fs.readFileSync(gp, 'utf8'));
    goldenC += realFindings.filter(x => x.level === 'CRITICAL').length;
    goldenW += realFindings.filter(x => x.level === 'WARNING').length;
  }
  check('金样：真实代码库 0 CRITICAL（实际 ' + goldenC + '）', goldenC === 0);
  check('金样：真实代码库 0 WARNING（实际 ' + goldenW + '）', goldenW === 0);
  if (goldenC || goldenW) {
    for (const gf of DEFAULT_FILES) {
      const gp = path.join(ROOT, gf);
      if (!fs.existsSync(gp)) continue;
      const bad = auditFile(gf, fs.readFileSync(gp, 'utf8')).filter(x => x.level === 'CRITICAL' || x.level === 'WARNING');
      if (bad.length) { console.log('    ⚠️ ' + gf + ' 明细：'); bad.forEach(c => console.log('      L' + c.line + ' ' + c.kind + ' — ' + c.reason)); }
    }
  }

  console.log('\n自测结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  return fail === 0 ? 0 : 1;
}

/* ---------------- main ---------------- */

function main() {
  const args = process.argv.slice(2);
  const opts = {
    json: args.includes('--json'),
    failOnWarning: args.includes('--fail-on-warning'),
    selftest: args.includes('--selftest')
  };
  if (opts.selftest) {
    process.exit(selftest());
  }

  const files = args.filter(a => !a.startsWith('--'));
  const targets = files.length ? files : DEFAULT_FILES;
  let allFindings = [];
  for (const f of targets) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) { console.error('⚠️ 文件不存在: ' + f); continue; }
    const src = fs.readFileSync(abs, 'utf8');
    allFindings = allFindings.concat(auditFile(f, src));
  }

  if (!opts.json) console.log('═══ Vue 模式冲突审计（' + targets.join(', ') + '）═══');
  printReport(allFindings, opts);

  const s = summarize(allFindings);
  if (!opts.json) {
    console.log('\n════════════════════════════════════');
    console.log('摘要: 🔴 ' + s.CRITICAL + '  |  🟡 ' + s.WARNING + '  |  🟢 ' + s.OK + '  |  ℹ️ ' + s.INFO);
    console.log('════════════════════════════════════');
  }

  if (s.CRITICAL > 0) process.exit(1);
  if (opts.failOnWarning && s.WARNING > 0) process.exit(2);
  process.exit(0);
}

main();
