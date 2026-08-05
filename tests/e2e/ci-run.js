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
    const pages = ['skeleton', 'training', 'stems', 'ai', 'scene', 'schedule', 'reference', 'wordlist'];
    for (const p of pages) {
      const ok = await ev(async (pg) => {
        window.navigate(pg);
        await new Promise((r) => setTimeout(r, 250));
        return window.vueApp.currentPage === pg &&
          !!document.querySelector('.' + pg + '-page-vue');
      }, p);
      check(`导航→${p}（Vue 路由 + 页面渲染）`, ok);
    }

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
