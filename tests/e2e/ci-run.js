#!/usr/bin/env node
/**
 * tests/e2e/ci-run.js — 便携式 E2E 回归运行器（CI 用，零本地 CLI 依赖）
 *
 * 背景：tests/e2e/run-tests.sh 依赖 Freebuff 本地 playwright_cli.sh（~/.zcode/...），
 * GitHub Actions 上不存在。本运行器用官方 playwright 库复刻其中最关键的安全断言：
 *   - 页面可加载、Vue 路由可导航（currentPage 切换 + 页面专属 wrapper 渲染）
 *   - 筛选后 #vue-root 存活、导航仍可用（setTrainingFilter 修复回归）
 *   - pageTick/refreshPage 机制：保存/删除自定义场景、清空训练数据后
 *     pageKey 变化 + DOM 即时更新（clearData/saveCustomScene/deleteCustomScene 修复回归）
 *
 * 用法：
 *   node tests/e2e/ci-run.js                 # 默认 chromium（CI 用 npx playwright install chromium --with-deps）
 *   PW_CHANNEL=chrome node tests/e2e/ci-run.js  # 本地复用已装 Chrome，免下载浏览器
 * 退出码：0 = 全部通过，1 = 有失败（供 CI 拦截发布）
 */
'use strict';

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');

const BASE = process.env.E2E_BASE || 'http://localhost:9999';
const PASS = [];
const FAIL = [];

function check(name, ok) {
  (ok ? PASS : FAIL).push(name);
  console.log(`  ${ok ? '\x1b[32m✅ PASS\x1b[0m' : '\x1b[31m❌ FAIL\x1b[0m'} ${name}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probe(url, tries = 40) {
  return new Promise((resolve) => {
    let n = 0;
    const lib = url.startsWith('https:') ? https : http; // E2E_BASE 支持 https 生产域名
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

async function main() {
  let serverProc = null;
  let browser = null;
  try {
    // 1) 确保 web server 可用：CI 由 workflow 启动；本地自动拉起（幂等）
    // 记录是否由本脚本拉起——只清理自己拉起的进程，绝不误杀外部已运行的 server
    // 注意：spawn+probe 必须在 try 内，否则启动失败 throw 会跳过 finally 泄漏子进程
    serverProc = (await probe(BASE)) ? null : spawn(process.execPath, ['web_server.js'], { stdio: 'ignore' });
    if (serverProc && !(await probe(BASE))) {
      console.error('❌ Web server 无法启动');
      throw new Error('web server start failed');
    }

    browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
    const context = await browser.newContext();
    // 首页脚本执行前预置 onboarding 标记，避免新手引导遮罩干扰
    await context.addInitScript(() => {
      try { localStorage.setItem('korean_onboarded', '1'); } catch (e) { /* ignore */ }
    });
    const page = await context.newPage();
    // 注意：必须转发第二参数——否则回调里拿不到 arg（曾致导航断言全部空转假通过）
    const ev = (fn, arg) => page.evaluate(fn, arg);

    console.log('========================================');
    console.log(' Portable E2E (ci-run.js)');
    console.log('========================================');

    // --- T1: 首页加载 ---
    await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => !!window.vueApp, null, { timeout: 15000 });
    await sleep(300);
    const title = await page.title();
    check('首页标题 Basic Korean', /basic korean/i.test(title));

    // --- T2: Vue 路由导航（逐页 currentPage 切换 + 页面专属 wrapper 渲染） ---
    // 断言页面专属 class（如 .training-page-vue）存在，避免组件注册失败时 Vue 把
    // 未知元素原样渲染导致 children.length>0 的假通过
    const pages = ['skeleton', 'training', 'stems', 'ai', 'scene', 'schedule', 'wordlist'];
    for (const p of pages) {
      const ok = await ev(async (pg) => {
        window.navigate(pg);
        await new Promise((r) => setTimeout(r, 250));
        return window.vueApp.currentPage === pg &&
          !!document.querySelector('.' + pg + '-page-vue');
      }, p);
      check(`导航→${p}（Vue 路由 + 页面渲染）`, ok);
    }

    // --- T2b: Vue 路径入场动效回归（P0 修复）---
    // 背景：Vue 分支曾从不给 #mainContent 挂 page-enter，且 switchSkeletonTab 等处把 class
    // 挂到了 .xxx-page-vue 根节点——CSS 选择器是 `.main.page-enter ...`，两处都导致
    // 整套入场动画线上从不触发（切页硬切、CSS 成死代码）。这里断言 class 落位 + 动画真在跑。
    const enterClassOk = await ev(async () => {
      window.navigate('skeleton');
      await new Promise((r) => setTimeout(r, 300));
      window.navigate('home');
      await new Promise((r) => setTimeout(r, 350));
      const main = document.getElementById('mainContent');
      return !!main && main.classList.contains('page-enter');
    });
    check('Vue 切页后 #mainContent 挂载 page-enter', enterClassOk);

    const enterAnimOk = await ev(async () => {
      const card = document.querySelector('.hero-card');
      if (!card) return false;
      const anims = typeof card.getAnimations === 'function' ? card.getAnimations() : [];
      if (anims.length) return anims.some((a) => a.playState === 'running');
      return getComputedStyle(card).animationName !== 'none';
    });
    check('Vue 切页后 hero 卡片入场动画运行中', enterAnimOk);

    // 骨架页 Tab 切换：曾把 page-enter 挂到 .skeleton-page-vue 根节点，CSS 选择器
    // `.main.page-enter ...` 匹配不到 → 动画死。这里断言两件事：
    //   (a) class 只落在 .main 上，组件根节点不应带它
    //   (b) Tab 重绘后新插入的 .rule-item 确实拿到运行中的入场动画
    // 只断言 (a) 会假通过——navigate 进页面时已挂过 class，即使 Tab 分支是死的也仍是 true。
    const tabTargetOk = await ev(async () => {
      window.navigate('skeleton');
      await new Promise((r) => setTimeout(r, 400));
      if (typeof window.switchSkeletonTab === 'function') window.switchSkeletonTab('words');
      await new Promise((r) => setTimeout(r, 250));
      if (typeof window.switchSkeletonTab === 'function') window.switchSkeletonTab('rules');
      await new Promise((r) => setTimeout(r, 250));
      const main = document.getElementById('mainContent');
      const comp = document.querySelector('.skeleton-page-vue');
      return !!main && main.classList.contains('page-enter') &&
        !(comp && comp.classList.contains('page-enter'));
    });
    check('骨架 Tab 切换：page-enter 只挂在 .main 上', tabTargetOk);

    const tabAnimOk = await ev(async () => {
      const item = document.querySelector('.rule-item');
      if (!item) return false;
      const anims = typeof item.getAnimations === 'function' ? item.getAnimations() : [];
      if (anims.length) return anims.some((a) => a.playState === 'running');
      return getComputedStyle(item).animationName !== 'none';
    });
    check('骨架 Tab 切换后 rule-item 入场动画运行中', tabAnimOk);

    // --- T4: 统计仪表盘结构回归（Phase 4.1）---
    // 统计弹窗已升级为仪表盘：4 个核心指标卡片 + 2 条完成度进度条 + ARIA 标注。
    // 断言 openStats() 后这些结构在 DOM 中真实渲染。
    const statsOpenOk = await ev(async () => {
      window.openStats();
      await new Promise((r) => setTimeout(r, 400));
      return document.querySelectorAll('.stat-card').length === 5 &&
        document.querySelectorAll('.stat-bar').length === 2 &&
        document.querySelectorAll('.stat-progress-row').length === 2;
    });
    check('统计弹窗打开（5 卡片 + 2 进度条）', statsOpenOk);

    const statsBarsOk = await ev(async () => {
      const bar = document.querySelector('.stat-bar');
      const fills = document.querySelectorAll('.stat-bar-fill');
      if (!bar || fills.length !== 2) return false;
      // 进度条有 aria 可访问标注
      const ariaOk = bar.hasAttribute('aria-valuenow') && bar.hasAttribute('aria-valuemax');
      // 进度条填充宽度百分比已设置（数值型，不是空字符串）
      const widthsOk = Array.from(fills).every(function (f) {
        // 宽度是整数百分比且必须落在 0-100 闭区间（0 / 1-99 / 100 三种形态）
        return f.style.width && /^(0|100|[1-9]\d?)%$/.test(f.style.width);
      });
      return ariaOk && widthsOk;
    });
    check('统计进度条 ARIA + 宽度标注', statsBarsOk);

    await ev(() => { window.closeStats(); return true; });

    // --- T5: 拾遗复习统计 + 导出导入回归（Phase 4.3）---
    // 面板结构、四个操作按钮、CSV 解析器、导入弹窗 —— 四者任一被重构掉都要在这里被拦住。
    const wlPanelOk = await ev(async () => {
      window.navigate('wordlist');
      await new Promise((r) => setTimeout(r, 300));
      return document.querySelectorAll('.wordlist-stat').length === 4 &&
        document.querySelectorAll('.mini-bar-wrap').length === 7 &&
        !!document.querySelector('.wordlist-today');
    });
    check('拾遗统计面板（4 指标 + 近 7 天柱状图）', wlPanelOk);

    const wlButtonsOk = await ev(() => {
      const txt = Array.from(document.querySelectorAll('#mainContent button'))
        .map((b) => b.textContent || '').join('|');
      return txt.includes('复习模式') && txt.includes('导出 JSON') &&
        txt.includes('导出 CSV') && txt.includes('导入');
    });
    check('拾遗操作按钮齐备（复习/导出 JSON/导出 CSV/导入）', wlButtonsOk);

    // CSV 解析器：引号包裹的逗号、字段内换行、"" 转义 —— 手写解析器最容易错的三处
    const csvOk = await ev(() => {
      const rows = window.parseCSV('type,text,meaning\nword,"a,b",뜻\nword,plain,"line1\nline2"\n');
      return rows.length === 3 &&
        rows[0][0] === 'type' &&
        rows[1][1] === 'a,b' &&
        rows[2][2] === 'line1\nline2';
    });
    check('CSV 解析（引号内逗号 / 字段内换行）', csvOk);

    // 复习记账：标记一次状态 → 累计复习 0→1、今日状态翻转为已复习。
    // 这条同时守住「reviewMark 必须调 recordWordListReview」这个易被误删的调用。
    const wlReviewOk = await ev(async () => {
      localStorage.setItem('korean_collections', JSON.stringify([{
        id: 'c_e2e_1', userId: null, type: 'word', text: '테스트', meaning: '测试',
        source: 'manual', sourceRef: '', status: 'new', note: '',
        createdAt: Date.now(), updatedAt: Date.now()
      }]));
      localStorage.removeItem('korean_wordlist_review_log');
      const before = window.getWordListReviewStats();
      window.rerenderWordList();
      window.startWordListReview();
      window.reviewMark('c_e2e_1', 'learning');
      await new Promise((r) => setTimeout(r, 200));
      const after = window.getWordListReviewStats();
      window.exitWordListReview();
      // 现场还原，避免污染后续断言
      localStorage.removeItem('korean_collections');
      localStorage.removeItem('korean_wordlist_review_log');
      return before.total === 0 && after.total === 1 && after.todayDone === true;
    });
    check('复习记账（标记一次 → 累计 +1 / 今日已复习）', wlReviewOk);

    const wlImportOk = await ev(async () => {
      window.openWordListImport();
      await new Promise((r) => setTimeout(r, 200));
      const opened = !!document.getElementById('wordlistImportOverlay');
      window.closeWordListImport();
      await new Promise((r) => setTimeout(r, 150));
      return opened && !document.getElementById('wordlistImportOverlay');
    });
    check('拾遗导入弹窗可开可关', wlImportOk);

    // --- T5b: 实时同步守卫（Phase 4.2）---
    // 未登录时绝不能启动轮询 —— 否则每个游客都会对 /api/sync 持续打 401，
    // 既污染服务端日志又会在离线时刷满控制台。这条守住 startRealtimeSync 的登录前置检查。
    const rtGuardOk = await ev(async () => {
      if (window.isLoggedIn && window.isLoggedIn()) return true; // 有登录态则跳过本断言
      window.startRealtimeSync();
      await new Promise((r) => setTimeout(r, 120));
      const started = window.realtimeSyncTimer;
      window.stopRealtimeSync();
      window.stopRealtimeSync(); // 幂等：重复 stop 不抛错
      return started === null && window.realtimeSyncTimer === null;
    });
    check('未登录不启动实时同步轮询（且 stop 幂等）', rtGuardOk);

    // --- T6: 断句训练筛选回归（#vue-root 存活 + 导航恢复） ---
    const vrootOk = await ev(async () => {
      window.navigate('training');
      await new Promise((r) => setTimeout(r, 300));
      let btn = null;
      document.querySelectorAll('.filter-btn').forEach((x) => {
        if (x.dataset.group === 'unmastered') btn = x;
      });
      if (btn) btn.click();
      await new Promise((r) => setTimeout(r, 300));
      return !!document.getElementById('vue-root');
    });
    check('筛选后 #vue-root 保留', vrootOk);

    const navBackOk = await ev(async () => {
      window.navigate('home');
      await new Promise((r) => setTimeout(r, 600));
      return !!document.querySelector('.hero h1');
    });
    check('筛选后导航回首页正常', navBackOk);

    // --- T7: pageTick/refreshPage 机制回归 ---
    // 隔离：清掉上次运行可能遗留的自定义场景
    await ev(() => { localStorage.removeItem('korean_custom_scenes'); return true; });

    // 断言1-2：保存自定义场景 → pageKey 变化 + 卡片即时出现
    const keySaveOk = await ev(async () => {
      window.navigate('scene');
      await new Promise((r) => setTimeout(r, 400));
      const t = document.getElementById('sceneTitleInput');
      const p = document.getElementById('scenePromptInput');
      if (!t || !p) return false;
      t.value = '医院就诊';
      p.value = '你在韩国医院看病，需要向医生描述症状';
      const k1 = window.vueApp.pageKey;
      window.saveCustomScene();
      await new Promise((r) => setTimeout(r, 400));
      return window.vueApp.pageKey !== k1;
    });
    check('保存场景后 pageKey 变化', keySaveOk);

    const cardShown = await ev(async () => {
      const els = document.querySelectorAll('.scene-card-custom .scene-title');
      for (let i = 0; i < els.length; i++) {
        if (els[i].textContent === '医院就诊') return true;
      }
      return false;
    });
    check('保存后卡片即时出现', cardShown);

    // 断言3：#vue-root 存活
    const vrootSave = await ev(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return !!document.getElementById('vue-root') && !!document.querySelector('.scene-page-vue');
    });
    check('保存后 #vue-root 存活', vrootSave);

    // 断言4-5：删除自定义场景 → pageKey 再变 + 卡片消失
    const keyDelOk = await ev(async () => {
      const k2 = window.vueApp.pageKey;
      window.deleteCustomScene(0);
      await new Promise((r) => setTimeout(r, 400));
      return window.vueApp.pageKey !== k2;
    });
    check('删除场景后 pageKey 变化', keyDelOk);

    const cardGone = await ev(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return document.querySelectorAll('.scene-card-custom').length === 0;
    });
    check('删除后卡片即时消失', cardGone);

    // 断言6-7：清空训练数据 → pageKey 变化 + 进度即时 0 / 43
    const keyClearOk = await ev(async () => {
      window.navigate('training');
      await new Promise((r) => setTimeout(r, 400));
      window.trainingDone = { '1': true, '2': true };
      localStorage.setItem('korean_training_done', JSON.stringify(window.trainingDone));
      const k3 = window.vueApp.pageKey;
      // P1-1 改造：clearData 不再用原生 confirm()，改走 bkConfirm 自定义模态（默认聚焦取消）——
      // 测试须模拟「点击确定」即调用 window.bkConfirmOk() 才能触发清空回调（与 run-tests.sh 一致）。
      window.clearData('korean_training_done', '抽丝训练进度');
      await new Promise((r) => setTimeout(r, 200));
      if (typeof window.bkConfirmOk === 'function') window.bkConfirmOk();
      await new Promise((r) => setTimeout(r, 500));
      return window.vueApp.pageKey !== k3;
    });
    check('清空数据后 pageKey 变化', keyClearOk);

    const progZero = await ev(async () => {
      const el = document.getElementById('trainingProgress');
      return !!(el && el.textContent.trim() === '0 / 43');
    });
    check('清空后进度即时刷新 0/43', progZero);

    console.log('========================================');
    console.log(`  ${PASS.length} PASS / ${FAIL.length} FAIL`);
    console.log('========================================');
    return FAIL.length > 0 ? 1 : 0;
  } finally {
    // 清理：只杀本脚本拉起的 server，外部已运行的 9999 端口服务不受影响
    if (browser) await browser.close().catch(() => {});
    if (serverProc) serverProc.kill();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('❌ E2E 运行异常:', e && e.message ? e.message : e);
    process.exit(1);
  });
