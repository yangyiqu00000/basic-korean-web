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
    // 记录消息 + 首两行堆栈：只看 message 经常定位不到元凶（如 null.forEach）
    const stack = (err && err.stack || '').split('\n').slice(1, 3).join(' ← ').trim();
    collector.pageErrors.push((String(err && err.message || err) + (stack ? '  @ ' + stack : '')).slice(0, 300));
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
    // 2b 抽屉导航交互（mobile only）：开 → 遮罩同步 → aria → 背景滚动锁 → 关 → 无横向溢出。
    // 守住四个历史坑：translateX(100%) 越界引发横向滚动、backdrop-filter 劫持 fixed
    // containing block、nav 在 header stacking context 内盖住兄弟按钮、开抽屉时背景页可滚。
    const drawer = await page.evaluate(async () => {
      const nav = document.getElementById('mainNav');
      const btn = document.querySelector('.mobile-menu-btn');
      const beforeOpen = nav.classList.contains('drawer-open');
      window.toggleMobileMenu();
      await new Promise((r) => setTimeout(r, 400));
      const opened = nav.classList.contains('drawer-open');
      const bd = document.getElementById('navBackdrop');
      const backdropShown = !!(bd && bd.classList.contains('show'));
      const ariaOpen = btn.getAttribute('aria-expanded') === 'true';
      // 滚动锁：打开后 scrollTo 必须无效（html.drawer-lock → overflow:hidden 冻结视口滚动盒）
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 60));
      window.scrollTo(0, 300);
      await new Promise((r) => setTimeout(r, 60));
      const bgFrozen = window.scrollY < 1;
      // 抽屉打开时顶栏按钮必须仍可点（nav 不得盖住 header 的兄弟元素）
      const br = btn.getBoundingClientRect();
      const topClickable = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2) === btn;
      window.toggleMobileMenu();
      await new Promise((r) => setTimeout(r, 400));
      const closed = !nav.classList.contains('drawer-open');
      // 锁释放：关闭后页面必须恢复可滚
      window.scrollTo(0, 300);
      await new Promise((r) => setTimeout(r, 60));
      const scrollRestored = window.scrollY > 10;
      const noHScroll = document.documentElement.scrollWidth <= window.innerWidth + 1;
      return { beforeOpen, opened, backdropShown, ariaOpen, bgFrozen, topClickable, closed, scrollRestored, noHScroll };
    });
    if (drawer.beforeOpen) addFinding('error', '抽屉', '初始状态抽屉不应打开');
    if (!drawer.opened) addFinding('error', '抽屉', 'toggleMobileMenu 未打开抽屉');
    if (!drawer.backdropShown) addFinding('error', '抽屉', '遮罩未同步显示');
    if (!drawer.ariaOpen) addFinding('error', '无障碍', '汉堡按钮 aria-expanded 未更新');
    if (!drawer.bgFrozen) addFinding('error', '抽屉', '抽屉打开时背景仍可滚动（缺 drawer-lock 滚动锁）');
    if (!drawer.topClickable) addFinding('error', '抽屉', '抽屉打开后顶栏按钮被盖住不可点（z-index 层级错误）');
    if (!drawer.closed) addFinding('error', '抽屉', '抽屉关不掉');
    if (!drawer.scrollRestored) addFinding('error', '抽屉', '抽屉关闭后页面滚动未恢复（滚动锁未释放）');
    if (!drawer.noHScroll) addFinding('error', '响应式', '抽屉关闭后仍存在横向溢出');
    if (drawer.opened && drawer.backdropShown && drawer.ariaOpen && drawer.bgFrozen && drawer.topClickable && drawer.closed && drawer.scrollRestored && drawer.noHScroll) {
      note('抽屉导航：开合 / 遮罩 / aria / 滚动锁 / 顶栏可点 / 无溢出 全部正常');
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

    // 3d+ 首页复习提醒（B1）：有待复习且今日未复习 → 出现；点击 → 进入拾遗复习模式；
    // 今日已复习 → 消失。守三个口径：pending 非掌握数、todayDone 与拾遗页统计同源、进入走单一代码路径。
    const nudge = await page.evaluate(async () => {
      const prevCollections = localStorage.getItem('korean_collections');
      const prevLog = localStorage.getItem('korean_wordlist_review_log');
      localStorage.setItem('korean_collections', JSON.stringify([
        { id: 'nudge-1', type: 'word', text: '셀프체크', meaning: '自检', source: 'skeleton', status: 'new', ts: Date.now() },
        { id: 'nudge-2', type: 'word', text: '이미품음', meaning: '已掌握占位', source: 'skeleton', status: 'mastered', ts: Date.now() }
      ]));
      localStorage.removeItem('korean_wordlist_review_log');
      window.navigate('home');
      await new Promise((r) => setTimeout(r, 400));
      const shown = !!document.querySelector('.home-review-nudge');
      const shownText = shown ? document.querySelector('.home-review-nudge').innerText.replace(/\n/g, ' ') : '';
      const btn = document.querySelector('.home-review-nudge button');
      let reviewEntered = false;
      if (btn) {
        btn.click();
        await new Promise((r) => setTimeout(r, 500));
        reviewEntered = window.currentPage === 'wordlist' && window.wordListReviewMode === true;
      }
      localStorage.setItem('korean_wordlist_review_log', JSON.stringify([{ id: 'nudge-1', time: Date.now() }]));
      window.navigate('home');
      await new Promise((r) => setTimeout(r, 400));
      const hiddenAfterReviewed = !document.querySelector('.home-review-nudge');
      // 恢复原值：null 必须 removeItem 而非 setItem(key, null)——后者存入字符串 "null"，
      // 会毒化 getCollections/safeParse 链（历史坑：null.forEach 崩统计渲染）
      if (prevCollections === null) localStorage.removeItem('korean_collections');
      else localStorage.setItem('korean_collections', prevCollections);
      if (prevLog === null) localStorage.removeItem('korean_wordlist_review_log');
      else localStorage.setItem('korean_wordlist_review_log', prevLog);
      window.navigate('home');
      await new Promise((r) => setTimeout(r, 300));
      return { shown, shownText, reviewEntered, hiddenAfterReviewed };
    });
    if (!nudge.shown) addFinding('error', '首页提醒', '有待复习且今日未复习时首页提醒条未出现');
    if (nudge.shown && !nudge.reviewEntered) addFinding('error', '首页提醒', '提醒条按钮未进入拾遗复习模式');
    if (nudge.shown && !nudge.hiddenAfterReviewed) addFinding('error', '首页提醒', '今日已复习后提醒条仍显示');
    if (nudge.shown && nudge.reviewEntered && nudge.hiddenAfterReviewed) note('首页复习提醒：出现 / 进入复习 / 已复习消失 全部正常');

    // 3d++ 快捷键面板（B6）：? 呼出 → 面板出现且含「0=统计」行；Esc 关闭。0 键须真的能开统计（存量 bug：tooltip 宣称按 0 但从未绑定）。
    const kbd = await page.evaluate(async () => {
      window.navigate('home');
      await new Promise((r) => setTimeout(r, 300));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      const opened = !!document.getElementById('shortcutsOverlay');
      const hasStatsRow = opened && document.getElementById('shortcutsOverlay').innerText.includes('学习统计仪表盘');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      const escClosed = !document.getElementById('shortcutsOverlay');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      const zeroOpensStats = !!document.getElementById('statsOverlay');
      if (zeroOpensStats) window.closeStats();
      return { opened, hasStatsRow, escClosed, zeroOpensStats };
    });
    if (!kbd.opened) addFinding('error', '快捷键', '? 未呼出快捷键面板');
    if (kbd.opened && !kbd.hasStatsRow) addFinding('error', '快捷键', '面板缺少统计快捷键行');
    if (kbd.opened && !kbd.escClosed) addFinding('error', '快捷键', 'Esc 未关闭快捷键面板');
    if (!kbd.zeroOpensStats) addFinding('error', '快捷键', '按 0 未打开统计仪表盘（title 宣称与实际行为不符）');
    if (kbd.opened && kbd.hasStatsRow && kbd.escClosed && kbd.zeroOpensStats) note('快捷键面板：? 呼出 / Esc 关闭 / 0 开统计 全部正常');

    // 3d* 复习模式键盘（Iteration 011）：→ 下一张 / ← 上一张 / 空格翻面，仅复习态生效
    const reviewKbd = await page.evaluate(async () => {
      const prev = localStorage.getItem('korean_collections');
      localStorage.setItem('korean_collections', JSON.stringify([
        { id: 'kb1', type: 'word', text: '가', meaning: '甲', source: 'manual', status: 'new', ts: Date.now() },
        { id: 'kb2', type: 'word', text: '나', meaning: '乙', source: 'manual', status: 'new', ts: Date.now() }
      ]));
      window.navigate('wordlist');
      await new Promise((r) => setTimeout(r, 300));
      window.startWordListReview();
      await new Promise((r) => setTimeout(r, 300));
      const idx0 = window.wordListReviewIdx;
      const hasSpeak = !!document.querySelector('.flashcard .korean-speak-btn');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      const idx1 = window.wordListReviewIdx;
      const clsBefore = document.querySelector('.flashcard').className;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      const clsAfter = document.querySelector('.flashcard').className;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      const idx2 = window.wordListReviewIdx;
      window.exitWordListReview();
      if (prev === null) localStorage.removeItem('korean_collections');
      else localStorage.setItem('korean_collections', prev);
      window.navigate('home');
      await new Promise((r) => setTimeout(r, 200));
      return { nextOk: idx1 === idx0 + 1, flipOk: clsAfter.includes('flipped') && !clsBefore.includes('flipped'), backOk: idx2 === idx0, hasSpeak };
    });
    if (!reviewKbd.nextOk) addFinding('error', '复习键盘', '→ 未切到下一张');
    if (!reviewKbd.flipOk) addFinding('error', '复习键盘', '空格未翻面');
    if (!reviewKbd.backOk) addFinding('error', '复习键盘', '← 未切回上一张');
    if (!reviewKbd.hasSpeak) addFinding('error', '复习键盘', '抽认卡正面缺少发音按钮');
    if (reviewKbd.nextOk && reviewKbd.flipOk && reviewKbd.backOk && reviewKbd.hasSpeak) note('复习键盘：→ / 空格 / ← / 发音按钮 全部正常');

    // 3d** 弹窗焦点陷阱（Iteration 013）：面板打开后 Tab 循环不逃逸，Esc 关闭后焦点归还打开者
    const trap = { opened: false, inside: false, stillInside: false, restored: false };
    try {
      await page.locator('.stats-toggle').focus();
      await page.keyboard.press('?');
      await page.waitForTimeout(250);
      trap.opened = await page.evaluate(() => !!document.getElementById('shortcutsOverlay'));
      trap.inside = await page.evaluate(() => { const ov = document.getElementById('shortcutsOverlay'); return !!ov && ov.contains(document.activeElement); });
      for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
      trap.stillInside = await page.evaluate(() => { const ov = document.getElementById('shortcutsOverlay'); return !!ov && ov.contains(document.activeElement); });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      trap.restored = await page.evaluate(() => !document.getElementById('shortcutsOverlay') && !!document.activeElement && document.activeElement.classList.contains('stats-toggle'));
    } catch (err) { /* 页面态异常按断言失败处理 */ }
    if (!trap.opened) addFinding('error', '焦点陷阱', '快捷键面板未能打开');
    if (trap.opened && !trap.inside) addFinding('error', '焦点陷阱', '面板打开后焦点未移入弹窗');
    if (trap.opened && !trap.stillInside) addFinding('error', '焦点陷阱', 'Tab 循环逃逸到背景内容');
    if (trap.opened && !trap.restored) addFinding('error', '焦点陷阱', 'Esc 关闭后焦点未归还打开者');
    if (trap.opened && trap.inside && trap.stillInside && trap.restored) note('焦点陷阱：移入 / Tab 循环 / Esc 归还 全部正常');

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
