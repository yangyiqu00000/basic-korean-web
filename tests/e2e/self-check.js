#!/usr/bin/env node
/**
 * tests/e2e/self-check.js — 浏览器自检扫描器
 *
 * 与 ci-run.js 互补，分工明确：
 *   - ci-run.js    「预设断言」型：已知正确答案，验证它没被改坏（防复发）
 *   - self-check.js「探索扫描」型：不知道哪里有错，主动扫常见故障（找新问题）
 *
 * 扫描项：
 *   1. 控制台 error / 未捕获异常 / pageerror
 *   2. 失败的网络请求（requestfailed）与 4xx、5xx 响应
 *   3. 横向溢出（窄屏下内容超出视口宽度 → 手机上出现横向滚动条）
 *   4. 关键结构缺失（#vue-root / #mainContent / 导航项 / 页面内容为空）
 *   5. 交互流程（统计弹窗、拾遗统计面板、导入弹窗、复习模式、主题切换）
 *
 * 产物（已在 .gitignore 中）：tests/e2e/_selfcheck/{report.json, *.png}
 *
 * 用法：
 *   node tests/e2e/self-check.js                        # 默认连 localhost:9999（未起则自动拉起）
 *   PW_CHANNEL=chrome node tests/e2e/self-check.js      # 本地复用系统 Chrome，免下载浏览器
 *   E2E_BASE=https://xxx.pages.dev node tests/e2e/self-check.js   # 扫生产
 * 退出码：0 = 无问题，1 = 发现问题（供 CI 拦截）
 */
'use strict';

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = process.env.E2E_BASE || 'http://localhost:9999';
const OUT_DIR = path.join(__dirname, '_selfcheck');
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 375, height: 812 }
];
// 导航项与对应页面（与 index.html / vue-app.js 路由保持一致）
const PAGES = ['home', 'skeleton', 'stems', 'training', 'ai', 'scene', 'schedule', 'wordlist'];

const findings = [];
const notes = [];

function addFinding(severity, category, detail) {
  findings.push({ severity, category, detail });
  const icon = severity === 'error' ? '🔴' : '🟡';
  console.log(`  ${icon} [${category}] ${detail}`);
}
function note(msg) {
  notes.push(msg);
  console.log(`  ℹ️  ${msg}`);
}

function probe(url, tries = 40) {
  return new Promise((resolve) => {
    let n = 0;
    const lib = url.startsWith('https:') ? https : http;
    const tryOnce = () => {
      const req = lib.get(url, (res) => { res.resume(); resolve(true); });
      req.on('error', () => {
        if (++n >= tries) resolve(false);
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

/** 挂载监听，把这一轮页面访问期间产生的所有异常收进 collector */
function attachCollectors(page, collector) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    // TTS/AI 是可选的本地服务（tts_server.js），本地没起属于预期，不算问题
    if (/tts|1234|ai\/status|ERR_CONNECTION_REFUSED/i.test(t)) return;
    collector.consoleErrors.push(t.slice(0, 300));
  });
  page.on('pageerror', (err) => {
    collector.pageErrors.push(String(err && err.message || err).slice(0, 300));
  });
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (/1234|tts/.test(u)) return; // 同上：本地 TTS 服务未启动
    collector.failedRequests.push(`${u} — ${req.failure() && req.failure().errorText}`);
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const u = res.url();
    if (/1234|tts/.test(u)) return;
    collector.badResponses.push(`${status} ${u}`);
  });
}

function flushCollectors(label, collector) {
  const seen = new Set();
  const uniq = (arr) => arr.filter((x) => !seen.has(x) && seen.add(x));
  uniq(collector.consoleErrors).forEach((t) => addFinding('error', `${label} 控制台错误`, t));
  uniq(collector.pageErrors).forEach((t) => addFinding('error', `${label} 未捕获异常`, t));
  uniq(collector.failedRequests).forEach((t) => addFinding('error', `${label} 请求失败`, t));
  uniq(collector.badResponses).forEach((t) => addFinding('error', `${label} HTTP 错误`, t));
}

/**
 * 横向溢出检测。
 * 只报表层容器级别的溢出：逐个检查直接子元素级的可见块，避免被内部
 * position:absolute 装饰元素干扰（那些不影响页面是否出现横向滚动条）。
 * 真正的判据是 documentElement.scrollWidth > clientWidth。
 */
async function checkOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const pageOverflow = de.scrollWidth - vw;
    if (pageOverflow <= 1) return { vw, pageOverflow: 0, culprits: [] };
    // 溢出成立 → 找出是谁撑宽的（只看宽度超过视口的元素，且排除 fixed/absolute 装饰）
    const culprits = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'absolute') return;
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.right > vw + 1 || r.width > vw + 1) {
        culprits.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 60),
          w: Math.round(r.width),
          right: Math.round(r.right)
        });
      }
    });
    return { vw, pageOverflow: Math.round(pageOverflow), culprits: culprits.slice(0, 5) };
  });
}

async function run() {
  let serverProc = null;
  let browser = null;
  try {
    serverProc = (await probe(BASE)) ? null : spawn(process.execPath, ['web_server.js'], { stdio: 'ignore' });
    if (serverProc && !(await probe(BASE))) throw new Error('web server 无法启动');

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    // 清掉上一轮截图，避免旧图混进本轮报告
    fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png')).forEach((f) => fs.unlinkSync(path.join(OUT_DIR, f)));

    browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
    const ctx = await browser.newContext({ viewport: VIEWPORTS[0] });
    const page = await ctx.newPage();
    const collector = { consoleErrors: [], pageErrors: [], failedRequests: [], badResponses: [] };
    attachCollectors(page, collector);

    console.log(`\n=== 自检 ${BASE} ===\n`);

    // ---------- 1. 逐页扫描（桌面视口） ----------
    console.log('[1/4] 逐页扫描（桌面 1280px）');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    for (const p of PAGES) {
      const ok = await page.evaluate(async (name) => {
        if (typeof window.navigate !== 'function') return false;
        window.navigate(name);
        await new Promise((r) => setTimeout(r, 350));
        return true;
      }, p);
      if (!ok) { addFinding('error', '路由', `navigate('${p}') 不可用`); continue; }

      const dom = await page.evaluate(() => {
        const main = document.getElementById('mainContent');
        return {
          vueRoot: !!document.getElementById('vue-root'),
          mainExists: !!main,
          textLen: main ? (main.innerText || '').trim().length : 0,
          heading: (document.querySelector('#mainContent h2') || {}).innerText || ''
        };
      });
      if (!dom.vueRoot) addFinding('error', '结构', `${p}: #vue-root 丢失`);
      if (!dom.mainExists) addFinding('error', '结构', `${p}: #mainContent 丢失`);
      if (dom.textLen < 20) addFinding('error', '内容', `${p}: 页面内容为空（${dom.textLen} 字符）`);
      else note(`${p.padEnd(9)} ${String(dom.textLen).padStart(5)} 字  ${dom.heading}`);

      await page.screenshot({ path: path.join(OUT_DIR, `page-${p}.png`) });
    }

    // ---------- 2. 窄屏溢出复检 ----------
    console.log('\n[2/4] 窄屏溢出复检（375px）');
    await page.setViewportSize(VIEWPORTS[1]);
    for (const p of PAGES) {
      await page.evaluate(async (name) => {
        window.navigate(name);
        await new Promise((r) => setTimeout(r, 300));
      }, p);
      const ov = await checkOverflow(page);
      if (ov.pageOverflow > 1) {
        addFinding('error', '响应式', `${p}: 横向溢出 ${ov.pageOverflow}px（视口 ${ov.vw}）` +
          (ov.culprits.length ? ` → ${ov.culprits.map((c) => `${c.tag}.${c.cls}(${c.w}px)`).join(', ')}` : ''));
        await page.screenshot({ path: path.join(OUT_DIR, `overflow-${p}.png`) });
      }
    }
    await page.setViewportSize(VIEWPORTS[0]);

    // ---------- 3. 交互流程 ----------
    console.log('\n[3/4] 交互流程');

    // 3a 统计弹窗（Phase 4.1 仪表盘）
    const stats = await page.evaluate(async () => {
      if (typeof window.openStats !== 'function' || typeof window.closeStats !== 'function') {
        return { unavailable: true, cards: 0, bars: 0, rows: 0, badWidth: [], missingAria: 0, ttsSelect: false };
      }
      window.openStats();
      await new Promise((r) => setTimeout(r, 400));
      const bars = Array.from(document.querySelectorAll('.stat-bar'));
      const res = {
        cards: document.querySelectorAll('.stat-card').length,
        bars: bars.length,
        rows: document.querySelectorAll('.stat-progress-row').length,
        // 进度条宽度必须是整数百分比且落在 0-100
        badWidth: bars.map((b) => {
          const f = b.querySelector('.stat-bar-fill');
          return f ? f.style.width : null;
        }).filter((w) => !w || !/^(0|100|[1-9]\d?)%$/.test(w)),
        missingAria: bars.filter((b) => !b.hasAttribute('aria-valuenow')).length,
        ttsSelect: !!document.querySelector('.stats-modal select')
      };
      window.closeStats();
      return res;
    });
    if (stats.unavailable) {
      addFinding('error', '统计弹窗', 'openStats/closeStats 不存在（部署的是旧版代码）');
    } else {
      if (stats.cards !== 4) addFinding('error', '统计弹窗', `指标卡数量 ${stats.cards}，应为 4`);
      if (stats.bars !== 2) addFinding('error', '统计弹窗', `进度条数量 ${stats.bars}，应为 2`);
      if (stats.rows !== 2) addFinding('error', '统计弹窗', `进度行数量 ${stats.rows}，应为 2`);
      if (stats.badWidth.length) addFinding('error', '统计弹窗', `进度条宽度异常：${JSON.stringify(stats.badWidth)}`);
      if (stats.missingAria) addFinding('error', '无障碍', `${stats.missingAria} 条进度条缺 aria-valuenow`);
      if (!stats.ttsSelect) addFinding('error', '统计弹窗', 'TTS 语音下拉缺失');
      if (stats.cards === 4 && stats.bars === 2 && !stats.badWidth.length && !stats.missingAria) {
        note('统计弹窗：4 卡 + 2 进度条 + ARIA 正常');
      }
    }

    // 3b 拾遗页（Phase 4.3 统计面板 + 导出导入）
    await page.evaluate(async () => {
      window.navigate('wordlist');
      await new Promise((r) => setTimeout(r, 300));
    });
    const wl = await page.evaluate(() => ({
      stats: document.querySelectorAll('.wordlist-stat').length,
      bars: document.querySelectorAll('.mini-bar-wrap').length,
      today: !!document.querySelector('.wordlist-today'),
      hasImportBtn: Array.from(document.querySelectorAll('#mainContent button')).some((b) => /导入/.test(b.textContent))
    }));
    if (wl.stats !== 4) addFinding('error', '拾遗', `统计指标数 ${wl.stats}，应为 4`);
    if (wl.bars !== 7) addFinding('error', '拾遗', `柱状图柱数 ${wl.bars}，应为 7`);
    if (!wl.today) addFinding('error', '拾遗', '今日复习状态缺失');
    if (!wl.hasImportBtn) addFinding('error', '拾遗', '导入按钮缺失');
    if (wl.stats === 4 && wl.bars === 7 && wl.today && wl.hasImportBtn) note('拾遗：统计面板 + 柱状图 + 导入按钮正常');

    // 3c 导入弹窗开关
    const imp = await page.evaluate(async () => {
      if (typeof window.openWordListImport !== 'function' || typeof window.closeWordListImport !== 'function') {
        return { unavailable: true, opened: false, closed: false, hasFileInput: false, accept: '' };
      }
      window.openWordListImport();
      await new Promise((r) => setTimeout(r, 250));
      const opened = !!document.getElementById('wordlistImportOverlay');
      const hasFileInput = !!document.getElementById('wordlistImportFile');
      const accept = (document.getElementById('wordlistImportFile') || {}).accept || '';
      window.closeWordListImport();
      await new Promise((r) => setTimeout(r, 150));
      return { opened, closed: !document.getElementById('wordlistImportOverlay'), hasFileInput, accept };
    });
    if (imp.unavailable) {
      addFinding('error', '拾遗', 'openWordListImport 不存在（部署的是旧版代码）');
    } else {
      if (!imp.opened) addFinding('error', '拾遗', '导入弹窗打不开');
      if (!imp.closed) addFinding('error', '拾遗', '导入弹窗关不掉');
      if (!imp.hasFileInput) addFinding('error', '拾遗', '导入弹窗缺文件选择框');
      if (!/\.csv/.test(imp.accept)) addFinding('error', '拾遗', `导入文件类型未含 CSV（accept=${imp.accept}）`);
    }

    // 3d 复习模式完整流程（造一条收藏 → 进复习模式 → 标记 → 统计 +1）
    const reviewFns = await page.evaluate(() => ({
      rerender: typeof window.rerenderWordList === 'function',
      getStats: typeof window.getWordListReviewStats === 'function',
      start: typeof window.startWordListReview === 'function',
      mark: typeof window.reviewMark === 'function',
      exit: typeof window.exitWordListReview === 'function'
    }));
    const allReviewFns = Object.values(reviewFns).every(Boolean);
    if (!allReviewFns) {
      addFinding('error', '拾遗', '复习记账相关函数缺失（部署的是旧版代码）');
    } else {
      const review = await page.evaluate(async () => {
        const seed = [{
          id: 'c_selfcheck_1', userId: null, type: 'word', text: '안녕', meaning: '你好',
          source: 'manual', sourceRef: '', status: 'new', note: '',
          createdAt: Date.now(), updatedAt: Date.now()
        }];
        localStorage.setItem('korean_collections', JSON.stringify(seed));
        localStorage.removeItem('korean_wordlist_review_log');
        window.rerenderWordList();
        const before = window.getWordListReviewStats().total;
        window.startWordListReview();
        await new Promise((r) => setTimeout(r, 200));
        const inReview = !!document.querySelector('.flashcard');
        window.reviewMark('c_selfcheck_1', 'learning');
        await new Promise((r) => setTimeout(r, 250));
        const after = window.getWordListReviewStats().total;
        const todayDone = window.getWordListReviewStats().todayDone;
        window.exitWordListReview();
        localStorage.removeItem('korean_collections');
        localStorage.removeItem('korean_wordlist_review_log');
        window.rerenderWordList();
        return { before, after, inReview, todayDone };
      });
      if (!review.inReview) addFinding('error', '拾遗', '复习模式进入后没有抽认卡');
      if (review.after !== review.before + 1) {
        addFinding('error', '拾遗', `复习记账异常：${review.before} → ${review.after}（应为 +1）`);
      }
      if (!review.todayDone) addFinding('error', '拾遗', '标记复习后「今日已复习」未置真');
      if (review.after === review.before + 1 && review.todayDone) note('拾遗：复习记账 + 今日状态正常');
    }

    // 3e 主题切换（亮暗两套 token 都要能落地）
    const theme = await page.evaluate(async () => {
      const t0 = document.documentElement.getAttribute('data-theme');
      window.toggleTheme();
      await new Promise((r) => setTimeout(r, 300));
      const t1 = document.documentElement.getAttribute('data-theme');
      const bg = getComputedStyle(document.body).backgroundColor;
      window.toggleTheme();
      await new Promise((r) => setTimeout(r, 200));
      const t2 = document.documentElement.getAttribute('data-theme');
      return { t0, t1, t2, bg };
    });
    if (theme.t1 === theme.t0) addFinding('error', '主题', `切换无效（${theme.t0} → ${theme.t1}）`);
    if (theme.t2 !== theme.t0) addFinding('error', '主题', `切回无效（${theme.t1} → ${theme.t2}）`);
    if (!theme.bg || theme.bg === 'rgba(0, 0, 0, 0)') addFinding('error', '主题', 'body 背景色未生效');
    if (theme.t1 !== theme.t0 && theme.t2 === theme.t0) note(`主题切换正常（${theme.t0} ↔ ${theme.t1}）`);

    // ---------- 4. 汇总 ----------
    console.log('\n[4/4] 汇总');
    flushCollectors('全局', collector);

    const errors = findings.filter((f) => f.severity === 'error');
    const report = {
      base: BASE,
      checkedAt: new Date().toISOString(),
      viewports: VIEWPORTS,
      pages: PAGES,
      errorCount: errors.length,
      findings,
      notes
    };
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n产物：${path.relative(process.cwd(), OUT_DIR)}/report.json + *.png`);
    console.log(errors.length ? `\n❌ 发现 ${errors.length} 个问题` : '\n✅ 未发现问题');
    return errors.length ? 1 : 0;
  } catch (err) {
    console.error('❌ 自检脚本自身出错：', err && err.stack || err);
    return 2;
  } finally {
    if (browser) await browser.close();
    if (serverProc) serverProc.kill();
  }
}

run().then((code) => process.exit(code));
