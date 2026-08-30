// tests/e2e/viewport-480.js — 响应式断点实测（375/480/600/769）
//
// 背景：设计评审发现 769–1000px 区间导航被 `min-width:769px{display:flex!important}`
// 强制横排导致 8 个导航项溢出。本脚本把四个关键断点的 hero 栅格轨道数与
// 导航/汉堡互斥关系固化成断言，防止改 CSS 时悄悄回退。
//
// 用法：
//   node tests/e2e/viewport-480.js                    # 默认测本地 web_server（CI 用）
//   E2E_BASE=https://xxx.pages.dev node tests/e2e/viewport-480.js   # 测生产
//   node tests/e2e/viewport-480.js https://your.domain              # 位置参数亦可
//   PW_CHANNEL=chrome node tests/e2e/viewport-480.js  # 本地复用系统 Chrome，免下载浏览器
//
// 注：Chromium 会把 repeat(auto-fit, …) 计算为具体轨道值，故按解析轨道数断言。
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const http = require("http");
const https = require("https");

const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:9999";

// 探测服务是否可达：本地默认目标由本脚本按需拉起 web_server.js（幂等）
function probe(url, tries = 40) {
  return new Promise((resolve) => {
    let n = 0;
    const lib = url.startsWith("https:") ? https : http;
    const tryOnce = () => {
      const req = lib.get(url, (res) => { res.resume(); resolve(true); });
      req.on("error", () => {
        if (++n >= tries) resolve(false);
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

// 解析 grid-template-columns 实际轨道数：
//   "repeat(2, 1fr)"        → 2
//   "260px 260px" (已解析)  → 2
//   "1fr"                   → 1
function cols(gridTemplateColumns) {
  if (gridTemplateColumns.indexOf("auto-fit") !== -1 || gridTemplateColumns.indexOf("auto-fill") !== -1) return "auto-fit";
  const m = /repeat\((\d+)/.exec(gridTemplateColumns);
  if (m) return Number(m[1]);
  // 已解析形式：按空白切分，统计像轨道值的 token（px/fr/minmax）
  const tokens = gridTemplateColumns.split(/\s+/).filter(function (t) {
    return /(px|fr|minmax|auto|0)/.test(t);
  });
  if (tokens.length >= 1) return tokens.length;
  return 1;
}

let serverProc = null;

(async () => {
  // 目标不可达时自动拉起 web_server.js（默认本地目标）。测生产域名时不会触发。
  // 只清理自己拉起的进程，绝不误杀外部已在运行的 9999 服务。
  if (!(await probe(BASE))) {
    serverProc = spawn(process.execPath, ["web_server.js"], { stdio: "ignore" });
    if (!(await probe(BASE))) {
      console.error("❌ Web server 无法启动：" + BASE);
      process.exit(1);
    }
  }

  // PW_CHANNEL=chrome 时复用系统 Chrome（CI 由 workflow 装 chromium，本地可免下载）
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  } catch (e) {
    browser = await chromium.launch();
  }
  const results = [];

  try {
  for (const vp of [
    { name: "375px(手机窄)", width: 375, expectHero: 1, expectNavHidden: true },
    { name: "480px(中间断点)", width: 480, expectHero: 2, expectNavHidden: true },
    { name: "600px(中间断点)", width: 600, expectHero: 2, expectNavHidden: true },
    { name: "769px(桌面起点)", width: 769, expectHero: 2, expectNavHidden: false }
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: 800 } });
    await page.goto(BASE + "/?cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    const data = await page.evaluate(() => {
      const hero = document.querySelector(".hero-cards");
      const nav = document.getElementById("mainNav");
      const menuBtn = document.querySelector(".mobile-menu-btn");
      return {
        heroCols: hero ? getComputedStyle(hero).gridTemplateColumns : "(hero 未找到)",
        navDisplay: nav ? getComputedStyle(nav).display : "(nav 未找到)",
        menuBtnDisplay: menuBtn ? getComputedStyle(menuBtn).display : "(menuBtn 未找到)",
        title: document.title
      };
    });
    const heroCols = cols(data.heroCols);
    const navHidden = data.navDisplay === "none";
    const menuShown = data.menuBtnDisplay !== "none";
    const pass =
      heroCols === vp.expectHero &&
      navHidden === vp.expectNavHidden &&
      menuShown === vp.expectNavHidden; // 导航隐藏 ⇔ 汉堡显示
    results.push({
      vp: vp.name,
      heroCols: data.heroCols + " → " + heroCols,
      navDisplay: data.navDisplay,
      menuBtn: data.menuBtnDisplay,
      heroOK: heroCols === vp.expectHero ? "✓" : "✗ (期望 " + vp.expectHero + ")",
      navHidden: navHidden === vp.expectNavHidden ? "✓" : "✗",
      overall: pass ? "PASS" : "FAIL"
    });
    await page.close();
  }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (serverProc) serverProc.kill();
  }

  console.log("=== 响应式断点实测 (" + BASE + ") ===");
  let allPass = true;
  for (const r of results) {
    console.log(
      `[${r.vp}] hero-cols=${r.heroCols} ${r.heroOK} | nav=${r.navDisplay} ${r.navHidden} | menu=${r.menuBtn} | ${r.overall}`
    );
    if (r.overall === "FAIL") allPass = false;
  }
  console.log(allPass ? "✅ 全部断点断言通过" : "❌ 存在失败断言");
  await browser.close();
  process.exit(allPass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
