#!/usr/bin/env node
/**
 * scripts/asset-integrity.js — 静态资产完整性检查（防「引用了不存在的文件」漏网）
 *
 * 背景：index.html 曾引用 js/components/StatsPage.js，而该文件从未创建。
 * 线上每次加载都发一个 404 请求，而 CI 三道门（静态审计 / E2E / 双设备同步）
 * 都只检查「渲染出来的东西对不对」，不检查「引用的文件在不在」，于是长期漏网。
 *
 * 检查两个方向：
 *   1. 缺失引用（硬失败）— index.html 里引用的本地文件，磁盘上必须存在
 *   2. 孤儿文件（默认警告，--strict 下失败）— js/components/ 下存在但 index.html 未引用
 *
 * 用法：
 *   node scripts/asset-integrity.js            # 缺失引用失败，孤儿仅警告
 *   node scripts/asset-integrity.js --strict   # 孤儿也一并失败
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var ENTRY = path.join(ROOT, 'index.html');
var COMPONENTS_DIR = path.join(ROOT, 'js', 'components');
var STRICT = process.argv.indexOf('--strict') !== -1;

// index.html 里所有本地资源引用（src= / href=），去掉 ?v= 版本戳后按出现顺序去重
function collectReferences(html) {
  var refs = [];
  var seen = {};
  var re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var raw = m[1].trim();
    // 跳过外链、锚点、data URI、空值
    if (!raw || raw.charAt(0) === '#' || raw.indexOf('data:') === 0) continue;
    if (/^(https?:)?\/\//.test(raw)) continue;
    var file = raw.split('?')[0].split('#')[0];
    if (!file || seen[file]) continue;
    seen[file] = true;
    refs.push(file);
  }
  return refs;
}

function isExternalOrAbsolute(ref) {
  return ref.charAt(0) === '/' || /^[a-zA-Z]+:/.test(ref);
}

var html = fs.readFileSync(ENTRY, 'utf8');
var refs = collectReferences(html);

var missing = [];
var found = 0;
refs.forEach(function (ref) {
  if (isExternalOrAbsolute(ref)) return;
  var abs = path.join(ROOT, ref);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    found++;
  } else {
    missing.push(ref);
  }
});

// 孤儿文件：js/components/ 下存在，但 index.html 未引用
var orphans = [];
if (fs.existsSync(COMPONENTS_DIR)) {
  var referenced = {};
  refs.forEach(function (r) { referenced[path.basename(r)] = true; });
  fs.readdirSync(COMPONENTS_DIR)
    .filter(function (f) { return f.slice(-3) === '.js'; })
    .forEach(function (f) {
      if (!referenced[f]) orphans.push('js/components/' + f);
    });
}

console.log('=== 静态资产完整性检查 ===');
console.log('  入口: index.html');
console.log('  本地引用: ' + found + ' 个存在' + (missing.length ? '，' + missing.length + ' 个缺失' : ''));

var failed = false;

if (missing.length) {
  failed = true;
  console.log('');
  console.log('  ❌ 缺失引用（index.html 引用了不存在的文件，线上会 404）:');
  missing.forEach(function (r) { console.log('     - ' + r); });
} else {
  console.log('  ✅ 缺失引用: 无');
}

if (orphans.length) {
  console.log('');
  console.log('  ' + (STRICT ? '❌' : '⚠️ ') + ' 孤儿组件文件（存在但 index.html 未引用）:');
  orphans.forEach(function (r) { console.log('     - ' + r); });
  if (STRICT) {
    failed = true;
    console.log('     --strict 模式下视为失败');
  } else {
    console.log('     提示：确认无用后删除，或补回 index.html 引用');
  }
} else {
  console.log('  ✅ 孤儿组件: 无');
}

console.log('');
console.log(failed ? '❌ 资产完整性检查未通过' : '✅ 资产完整性检查通过');
process.exit(failed ? 1 : 0);
