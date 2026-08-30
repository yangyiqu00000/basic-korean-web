#!/usr/bin/env node
/**
 * scripts/contrast-audit.js — 设计系统色彩对比度审计（WCAG AA）
 *
 * 背景：设计评审发现主色 #c46a29 配白字只有 3.86:1，低于 WCAG AA 4.5；
 * 暗色主题下 --primary 是亮橙 #e8924f 却仍配白字，只有 2.43:1；
 * --accent 作正文色更是低到 2.37:1。这些都是「肉眼看着还行、实际不达标」的问题，
 * 光靠评审发现一次修一次不牢靠，固化为可执行断言。
 *
 * 做法：从 css/style.css 里解析 :root 与 [data-theme="dark"] 的自定义属性，
 * 对「设计系统契约」里声明的每一组前景/背景配对计算对比度，低于阈值即失败。
 * 阈值 4.5 对应 WCAG AA 正文标准（≥18.66px 粗体或 ≥24px 才可用 3.0）。
 *
 * 用法：node scripts/contrast-audit.js    （退出码 0=通过 1=未达标）
 * 维护：新增主色系 token 或改动配色后，请同步更新下方 CONTRACTS。
 */
'use strict';

var fs = require('fs');
var path = require('path');

var CSS = path.join(__dirname, '..', 'css', 'style.css');
var AA_NORMAL = 4.5; // WCAG AA 正文最小对比度

// ---- WCAG 相对亮度 / 对比度 ----
function channel(v) {
  var c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hexToRgb(hex) {
  var h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function luminance(hex) {
  var rgb = hexToRgb(hex);
  if (!rgb) return null;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}
function contrast(fg, bg) {
  var l1 = luminance(fg), l2 = luminance(bg);
  if (l1 === null || l2 === null) return null;
  if (l1 < l2) { var t = l1; l1 = l2; l2 = t; }
  return (l1 + 0.05) / (l2 + 0.05);
}

// ---- 解析 CSS 自定义属性 ----
function parseVars(css, selector) {
  // 匹配 `selector { ... }` 块（selector 形如 ":root" 或 "[data-theme=\"dark\"]"）
  var esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp(esc + '\\s*\\{([^}]*)\\}');
  var m = re.exec(css);
  var out = {};
  if (!m) return out;
  var body = m[1];
  // 去掉注释，避免注释里的十六进制值被误当变量
  body = body.replace(/\/\*[\s\S]*?\*\//g, '');
  var varRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  var v;
  while ((v = varRe.exec(body)) !== null) {
    out[v[1]] = v[2].trim();
  }
  return out;
}

// 支持两种入参：'--token-name' 裸名，或 'var(--token-name)' 语法。
// 逐层解引用直到拿到纯十六进制色值；解不开（未定义 / 非纯色如 rgba）返回 null。
function resolve(value, vars) {
  var seen = 0;
  var cur = String(value).trim();
  // 裸 token 名（如 --primary）先查一次表
  if (/^--[\w-]+$/.test(cur)) {
    if (!(cur in vars)) return null;
    cur = String(vars[cur]).trim();
  }
  while (/^var\(/.test(cur) && seen++ < 10) {
    var name = /^var\(\s*(--[\w-]+)/.exec(cur);
    if (!name) return null;
    if (!(name[1] in vars)) return null;
    cur = String(vars[name[1]]).trim();
  }
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(cur) ? cur : null;
}

var css = fs.readFileSync(CSS, 'utf8');
var light = parseVars(css, ':root');
var dark = parseVars(css, '[data-theme="dark"]');

/**
 * 设计系统契约：每一条是一组「前景 / 背景 / 最小对比度 / 说明」
 * token 名写变量，脚本会到对应主题里解析成实际色值。
 */
var CONTRACTS = [
  // --primary 作填充：其上文字由 --on-primary 承载
  { fg: '--on-primary', bg: '--primary', label: '主色按钮/导航 active（文字 on 主色填充）' },
  // --primary-ink 作正文：落在各层浅底 / 深底
  { fg: '--primary-ink', bg: '--card-bg', label: '主色系正文 on 卡片底' },
  { fg: '--primary-ink', bg: '--bg', label: '主色系正文 on 页面底' },
  { fg: '--primary-ink', bg: '--primary-lighter', label: '主色系正文 on 浅色徽章底' },
  // 正文与次要文字
  { fg: '--text', bg: '--bg', label: '正文 on 页面底' },
  { fg: '--text', bg: '--card-bg', label: '正文 on 卡片底' },
  { fg: '--text-light', bg: '--bg', label: '次要文字 on 页面底' },
  { fg: '--text-light', bg: '--card-bg', label: '次要文字 on 卡片底' }
];

var failures = [];
var checked = 0;

[['亮色', light], ['暗色', dark]].forEach(function (pair) {
  var themeName = pair[0];
  var vars = pair[1];
  console.log('\n── ' + themeName + '主题 ──');
  CONTRACTS.forEach(function (c) {
    var fg = resolve(c.fg, vars);
    var bg = resolve(c.bg, vars);
    if (!fg || !bg) {
      console.log('  ⚠️  跳过 ' + c.label + '（token 未定义或非纯色：' + c.fg + ' / ' + c.bg + '）');
      return;
    }
    var r = contrast(fg, bg);
    checked++;
    var ok = r >= AA_NORMAL;
    var line = '  ' + (ok ? '✅' : '❌') + ' ' + c.label.padEnd(34) + fg + ' on ' + bg + ' = ' + r.toFixed(2) + ':1';
    console.log(line + (ok ? '' : '  (需 ≥' + AA_NORMAL + ')'));
    if (!ok) failures.push(themeName + ' · ' + c.label + ' ' + r.toFixed(2) + ':1');
  });
});

console.log('\n=== 对比度审计（WCAG AA ' + AA_NORMAL + ':1）===');
console.log('  已校验 ' + checked + ' 组配对');
if (failures.length) {
  failures.forEach(function (f) { console.log('  ❌ ' + f); });
  console.log('❌ 对比度审计未通过');
  process.exit(1);
}
console.log('✅ 对比度审计通过');
process.exit(0);
