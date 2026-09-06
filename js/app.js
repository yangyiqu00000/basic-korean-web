// Basic Korean Web App - Main Application
// ============================================

// ============================================
// 统一色彩系统 - 词性 → CSS class
// ============================================
// TTS / AI 服务地址：前端只连本地，需与 tts_server 绑定的 127.0.0.1 保持一致
var TTS_BASE = location.hostname === "127.0.0.1" || location.hostname === "localhost" ? "http://" + "127.0.0.1:1234" : "";

var APP_VERSION = "1.0.0";
var APP_LAST_COMMIT = "78da555 feat: 交叉链接";

// 安全解析 localStorage JSON：数据损坏/旧版残留时返回 fallback，避免整页崩溃
// （此前模块顶层 JSON.parse 一旦抛错会触发全局 error toast 且后续逻辑失效）
function safeParse(json, fallback) {
  if (json === null || json === undefined || json === "") return fallback;
  try { return JSON.parse(json); }
  catch (e) { return fallback; }
}
// localStorage 中明文存储（非 JSON）的键，导出/导入时原样读写，避免 JSON.parse('dark') 抛错
var PLAIN_STORAGE_KEYS = ["korean_theme","korean_voice","korean_onboarded"];
// 全量学习数据键（Iteration 026 根治轮）：exportAllData / clearData(ALL) 必须引用同一来源——
// 两轮教训（023 清空侧、025 导出侧各漏一次 korean_wordlist_review_log）证明散落清单必失同步。
// 注意：korean_theme 在清空清单内但导出也含（用户偏好随备份走）；korean_sync_* 元数据键不在此列（每设备各自维护）。
var ALL_STORAGE_KEYS = ["korean_training_done","korean_progress","korean_ai_history","korean_scene_history","korean_dismissed_tips","korean_custom_scenes","korean_collections","korean_theme","korean_voice","korean_onboarded","korean_wordlist_review_log"];

// 主题初始化与切换（暗色/亮色，localStorage 持久化，首次跟随系统偏好）
var THEME_KEY = "korean_theme";
function initTheme() {
  var saved = localStorage.getItem(THEME_KEY);
  if (saved) { applyTheme(saved); return; }
  // 首次访问：跟随系统偏好
  var prefers = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(prefers);
}
function applyTheme(theme) {
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  var btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}
function toggleTheme() {
  var cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  var next = cur === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
}

// 提示条关闭/显示管理（localStorage 持久化）
function shouldShowTip(id) { return !(safeParse(localStorage.getItem("korean_dismissed_tips"), {})[id]); }
function dismissTip(btn, id) {
  var d = safeParse(localStorage.getItem("korean_dismissed_tips"), {});
  d[id] = true;
  syncPut("korean_dismissed_tips", d);
  var banner = btn.closest(".tip-banner");
  if (banner) banner.style.display = "none";
}

// 学习统计弹窗
function openStats() {
  var overlay = document.createElement("div");
  overlay.className = "stats-overlay";
  overlay.id = "statsOverlay";
  overlay.onclick = function(e) { if (e.target === overlay) closeStats(); };
  overlay.innerHTML = renderStatsContent();
  document.body.appendChild(overlay);
  focusModal(overlay); // 焦点移入弹窗 + 记住打开者（关闭时归还）
  // Phase 3：已登录 → 用服务端统计（跨设备聚合）替换本地数据
  if (typeof isLoggedIn === "function" && isLoggedIn() && typeof apiFetch === "function") {
    apiFetch("/api/stats").then(function(d) {
      if (!d || !d.userId) return;
      var set = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      var scheduleTotal = SCHEDULE.reduce(function(s, d2) { return s + d2.tasks.length; }, 0);
      set("statTrainingCard", d.training_done + " / " + SENTENCES.length);
      set("statScheduleCard", d.progress_done + " / " + scheduleTotal);
      setStatBar("statTrainingBar", d.training_done, SENTENCES.length);
      setStatBar("statScheduleBar", d.progress_done, scheduleTotal);
      set("statAI", d.ai_history + " 次");
      set("statScene", (d.scenes ? d.scenes.history : 0) + " 场");
      set("statDays", d.learning_days + " 天");
      set("statMsgs", d.messages + " 条");
      set("statReviews", (typeof d.reviews === "number" ? d.reviews : 0) + " 次");
      // 云端徽标 + 收藏数
      var badge = document.getElementById("statCloudBadge");
      var cloudRow = document.getElementById("statCloudRow");
      if (badge) badge.textContent = "☁️ 云端同步数据 · 收藏 " + (d.collections ? d.collections.total : 0) + " 条 · 自定义场景 " + (d.scenes ? d.scenes.custom : 0) + " 个";
      if (cloudRow) cloudRow.style.display = "";
    }).catch(function() {});
  }
}
function closeStats() {
  var el = document.getElementById("statsOverlay");
  if (el) el.remove();
  restoreModalFocus();
}
function showOnboarding() {
  var overlay = document.createElement("div");
  overlay.className = "onboarding-overlay";
  overlay.id = "onboardingOverlay";
  overlay.innerHTML =
    '<div class="onboarding-backdrop" id="onboardingBackdrop"></div>' +
    '<div class="onboarding-modal">' +
      '<h2>🇰🇷 Basic Korean</h2>' +
      '<p>韩语最小可行学习系统<br>用最小的系统启动一门新语言</p>' +
      '<div class="onboarding-steps">' +
        '<div class="onboarding-step"><span class="step-icon">🏗️</span><div class="step-text"><strong>1. 筑基规则</strong>先建立语法地图——理解 7 大筑基，知道韩语有哪几个核心部件</div></div>' +
        '<div class="onboarding-step"><span class="step-icon">🃏</span><div class="step-text"><strong>2. 抽丝训练</strong>每天 3-5 句，先自己断句再展开看拆解，两周完成 43 句</div></div>' +
        '<div class="onboarding-step"><span class="step-icon">🤖</span><div class="step-text"><strong>3. 砥砺</strong>输入任意中文，AI 翻译并拆解词性/助词/词尾，按规则编号教学</div></div>' +
      '</div>' +
      '<button class="ai-submit-btn" onclick="closeOnboarding()">🚀 开始学习</button>' +
    '</div>';
  document.body.appendChild(overlay);
  // 点击背景关闭
  document.getElementById("onboardingBackdrop").onclick = closeOnboarding;
  // 6 秒后自动关闭
  setTimeout(function() {
    var el = document.getElementById("onboardingOverlay");
    if (el && el.parentNode) {
      el.classList.add("onboarding-fade-out");
      setTimeout(function() {
        if (el.parentNode) el.remove();
      }, 300);
    }
  }, 6000);
}
function closeOnboarding() {
  localStorage.setItem("korean_onboarded", "1");
  var el = document.getElementById("onboardingOverlay");
  if (el) {
    el.classList.add("onboarding-fade-out");
    setTimeout(function() {
      if (el.parentNode) el.remove();
    }, 300);
  }
}
// ---- 学习统计仪表盘（Phase 4.1）----
// 三件套：卡片 / 进度条 / 云端回填。
// 抽丝训练与润物表是「有总量、能算完成度」的两条主进度，做成「卡片看数字 + 进度条看比例」双重呈现；
// 连续学习与本周收藏是纯计数指标，只做卡片。
// ⚠️ 进度百分比一律 clamp 到 0-100：未开始时 total>0/done=0 得 0%，全部完成得 100%，
// 不会出现 NaN（total 为 0 的边界）或负数。
function statCard(icon, value, unit, label, id) {
  return '<div class="stat-card">' +
    '<div class="stat-card-icon">' + icon + '</div>' +
    '<div class="stat-card-num"' + (id ? ' id="' + id + '"' : "") + '>' + value +
      (unit ? ' <span class="stat-card-unit">' + unit + '</span>' : "") + '</div>' +
    '<div class="stat-card-label">' + label + '</div>' +
  '</div>';
}
function statBar(label, done, total, id) {
  var pct = total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0;
  return '<div class="stat-progress-row">' +
    '<div class="stat-progress-head"><span>' + label + '</span>' +
      '<span class="stat-progress-value">' + done + ' / ' + total + '（' + pct + '%）</span></div>' +
    '<div class="stat-bar" id="' + id + '" role="progressbar" aria-label="' + label + '"' +
      ' aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
      '<div class="stat-bar-fill" style="width:' + pct + '%"></div>' +
    '</div>' +
  '</div>';
}
// 云端 /api/stats 到达后回填：进度条宽度 + ARIA + 右侧文字一起更新，卡片数字单独 set。
// 只改 DOM 不整块重渲染——避免把用户正在操作的 TTS 下拉重置掉。
function setStatBar(id, done, total) {
  var bar = document.getElementById(id);
  if (!bar) return;
  var pct = total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0;
  bar.setAttribute("aria-valuenow", String(pct));
  var fill = bar.querySelector(".stat-bar-fill");
  if (fill) fill.style.width = pct + "%";
  // 进度条与右侧百分比文字同在 .stat-progress-row 下
  var row = bar.closest ? bar.closest(".stat-progress-row") : bar.parentNode;
  var head = row ? row.querySelector(".stat-progress-value") : null;
  if (head) head.textContent = done + " / " + total + "（" + pct + "%）";
}
function renderStatsContent() {
  var progress = safeParse(localStorage.getItem("korean_progress"), {});
  var trainingDone = safeParse(localStorage.getItem("korean_training_done"), {});
  var aiHistory = safeParse(localStorage.getItem("korean_ai_history"), []);
  var sceneHistory = safeParse(localStorage.getItem("korean_scene_history"), []);
  var scheduleTotal = SCHEDULE.reduce(function(s, d) { return s + d.tasks.length; }, 0);
  var scheduleDone = Object.values(progress).filter(function(v) { return v; }).length;
  var trainingDoneCount = Object.values(trainingDone).filter(function(v) { return v; }).length;
  var totalSentences = SENTENCES.length;
  var theme = document.documentElement.getAttribute("data-theme") === "dark" ? "暗色" : "亮色";
  // P2-1 学习洞察：连续学习天数 + 本周新收藏（本地估算，登录后由 /api/stats 徽标补充云端聚合）
  var streakDays = calcLocalStreak();
  var weekCols = calcWeekCollections();
  var loggedIn = typeof isLoggedIn === "function" && isLoggedIn();
  return '' +
    '<div class="stats-modal">' +
      '<button class="stats-close" onclick="closeStats()">✕</button>' +
      '<h2>📊 学习统计</h2>' +
      '<div class="stats-grid">' +
        statCard("🔥", streakDays, "天", "连续学习") +
        statCard("🆕", weekCols, "条", "本周新收藏") +
        statCard("📝", trainingDoneCount + " / " + totalSentences, "", "抽丝训练", "statTrainingCard") +
        statCard("🗓️", scheduleDone + " / " + scheduleTotal, "", "润物表", "statScheduleCard") +
        statCard("🔁", getWordListReviewStats().total, "次", "累计复习", "statReviews") +
      '</div>' +
      '<div class="stats-progress">' +
        statBar("抽丝训练完成度", trainingDoneCount, totalSentences, "statTrainingBar") +
        statBar("润物表完成度", scheduleDone, scheduleTotal, "statScheduleBar") +
      '</div>' +
      '<div class="stats-row"><span>🤖 AI 练句</span><span class="stat-value" id="statAI">' + aiHistory.length + ' 次</span></div>' +
      '<div class="stats-row"><span>💬 情景对话</span><span class="stat-value" id="statScene">' + sceneHistory.length + ' 场</span></div>' +
      '<div class="stats-row"><span>📅 学习天数</span><span class="stat-value" id="statDays">' + (loggedIn ? "…" : "—") + '</span></div>' +
      '<div class="stats-row"><span>💬 对话消息</span><span class="stat-value" id="statMsgs">' + (loggedIn ? "…" : "—") + '</span></div>' +
      '<div class="stats-row" style="display:none" id="statCloudRow"><span>☁️ 云端</span><span class="stat-value" id="statCloudBadge"></span></div>' +
      '<div class="stats-row"><span>🎨 主题</span><span class="stat-value">' + theme + '</span></div>' +
      '<div class="stats-row"><span>🔊 TTS 语音</span><span class="stat-value"><select onchange="setVoice(this.value)" style="background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;font-family:inherit;">' +
        '<option value="ko-KR-SunHiNeural" ' + (getVoice() === "ko-KR-SunHiNeural" ? "selected" : "") + '>SunHi (女声)</option>' +
        '<option value="ko-KR-InJoonNeural" ' + (getVoice() === "ko-KR-InJoonNeural" ? "selected" : "") + '>InJoon (男声)</option>' +
        '<option value="ko-KR-HyunsuMultilingualNeural" ' + (getVoice() === "ko-KR-HyunsuMultilingualNeural" ? "selected" : "") + '>Hyunsu (多语言)</option>' +
      '</select></span></div>' +
      '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--text-light);">' +
        '<strong>⚙️ 数据管理</strong>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">' +
          '<button class="ai-suggest-btn" onclick="clearData(\'korean_training_done\',\'抽丝训练进度\')">重置断句</button>' +
          '<button class="ai-suggest-btn" onclick="clearData(\'korean_progress\',\'润物表进度\')">重置润物</button>' +
          '<button class="ai-suggest-btn" onclick="clearData(\'korean_ai_history\',\'砥砺历史\')">清空AI历史</button>' +
          '<button class="ai-suggest-btn" onclick="clearData(\'korean_scene_history\',\'情景对话历史\')">清空情景</button>' +
          '<button class="ai-suggest-btn" onclick="clearData(\'korean_dismissed_tips\',\'已关闭的提示\')">重置提示</button>' +
          '<button class="ai-suggest-btn" style="color:var(--error);border-color:var(--error);" onclick="clearData(\'ALL\',\'所有学习数据\')">重置全部</button>' +
          '<button class="ai-suggest-btn" onclick="closeStats(); showOnboarding()">📖 新手引导</button>' +
          '<button class="ai-suggest-btn" onclick="exportAllData()">📤 备份数据</button>' +
          '<button class="ai-suggest-btn" onclick="document.getElementById(\'importInput\').click()">📥 导入备份</button>' +
          '<input type="file" id="importInput" accept=".json" style="display:none" onchange="importAllData(this)" />' +
        '</div>' +
        '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;font-size:11px;color:var(--text-light);text-align:center;">Basic Korean 🇰🇷 v' + APP_VERSION + ' · ' + APP_LAST_COMMIT + '</div>' +
      '</div>' +
    '</div>';
}

// P2-1 本地学习洞察计算：连续学习天数（以 AI/场景/收藏的活动日期为准，今天或昨天为锚点）
function calcLocalStreak() {
  var daySet = new Set();
  function addDay(ts) {
    if (!ts) return;
    var d = new Date(ts);
    daySet.add(d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate());
  }
  safeParse(localStorage.getItem("korean_ai_history"), []).forEach(function(h) { addDay(h.time); });
  safeParse(localStorage.getItem("korean_scene_history"), []).forEach(function(h) { addDay(h.time); });
  getCollections().forEach(function(c) { addDay(c.createdAt); });
  if (daySet.size === 0) return 0;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var dayMs = 86400000;
  var streak = 0;
  var cur = new Date(today);
  // 今天没学则从昨天起算（仍算连续）
  if (!daySet.has(cur.getFullYear() + "-" + (cur.getMonth() + 1) + "-" + cur.getDate())) {
    cur = new Date(cur.getTime() - dayMs);
  }
  while (daySet.has(cur.getFullYear() + "-" + (cur.getMonth() + 1) + "-" + cur.getDate())) {
    streak++;
    cur = new Date(cur.getTime() - dayMs);
  }
  return streak;
}
function calcWeekCollections() {
  var weekAgo = Date.now() - 7 * 86400000;
  return getCollections().filter(function(c) { return c.createdAt && c.createdAt >= weekAgo; }).length;
}

// 清空指定 localStorage 数据（带确认）
function clearData(key, name) {
  bkConfirm('确定将「' + name + '」清空？此操作不可恢复。', function() {
    var keys = key === "ALL" ? ALL_STORAGE_KEYS : [key]; // Iteration 026：单一事实源（023 曾漏清复习日志）
    // Phase 2：拾遗（收藏本）是记录级（不在 blob），重置前先快照收藏列表，清空后逐条删除云端收藏（否则下次拉取会复活）
    var colSnapshot = (typeof syncCollectDelete === "function" && (key === "ALL" || key === "korean_collections")) ? getCollections() : [];
    // Phase 3：场景记录级，重置前快照本地有 id 的条目（我的场景 + 对话记录镜像），清空后逐条删云端
    var sceneSnapshot = (typeof syncSceneDelete === "function" && (key === "ALL" || key === "korean_custom_scenes"))
      ? safeParse(localStorage.getItem("korean_custom_scenes"), []).filter(function(s) { return s.id; }) : [];
    var historySnapshot = (typeof syncSceneDelete === "function" && (key === "ALL" || key === "korean_scene_history"))
      ? safeParse(localStorage.getItem("korean_scene_history"), []).filter(function(h) { return h.id; }) : [];
    keys.forEach(function(k) { localStorage.removeItem(k); });
    // Phase 2：同步 key 必须写墓碑（clearedAt），否则另一设备拉取并集/合并会复活已清空的数据
    keys.forEach(function(k) {
      if (typeof syncClearBlob === "function" && typeof SYNC_BLOB_MAP === "object" && SYNC_BLOB_MAP[k]) {
        syncClearBlob(k);
        syncPut(k, SYNC_TYPES[SYNC_BLOB_MAP[k]] === "map" ? {} : []);
      }
    });
    colSnapshot.forEach(function(c) { syncCollectDelete(c.id, c.type, c.text); });
    sceneSnapshot.forEach(function(s) { syncSceneDelete(s.id); });
    historySnapshot.forEach(function(h) { syncSceneDelete(h.id); });
    // 重置模块级变量
    if (key === "ALL" || key === "korean_training_done") { trainingDone = {}; }
    if (key === "ALL" || key === "korean_ai_history") { aiHistory = []; }
    closeStats();
    setTimeout(function() { refreshCurrentPage(); }, 100);
    showToast('已清空「' + name + '」');
  });
}

// 导出全部学习数据为 JSON 备份文件
function exportAllData() {
  var keys = ALL_STORAGE_KEYS; // Iteration 026：单一事实源（曾与 clearData 各漏一次键，教训见 ALL_STORAGE_KEYS 注释）
  var data = {};
  keys.forEach(function(k) {
    var v = localStorage.getItem(k);
    if (v === null) return;
    // 明文键原样导出（避免 JSON.parse('dark') 抛错），其余安全解析
    data[k] = PLAIN_STORAGE_KEYS.indexOf(k) !== -1 ? v : safeParse(v, null);
  });
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "basic_korean_backup_" + Date.now() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast("✅ 已导出备份文件（" + keys.length + " 项数据）");
}

// 从 JSON 文件导入备份数据
function importAllData(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      bkConfirm("确定导入备份？此操作会覆盖当前所有学习数据。", function() {
        try {
          var count = 0;
          var skipped = [];
          // Iteration 029：键白名单收紧——曾按 Object.keys 回放任意键（恶意/手改备份可注入
          // 任意 localStorage 键、塞爆配额）。合法域 = ALL_STORAGE_KEYS（学习数据全集）
          // + PLAIN_STORAGE_KEYS（主题/语音等明文偏好，本就是 ALL_STORAGE_KEYS 子集）。
          // 域外键跳过并显式计数（静默会掩盖导出端 bug——025 教训：清单漏键靠导出侧发现）。
          var allowed = ALL_STORAGE_KEYS.concat(PLAIN_STORAGE_KEYS);
          Object.keys(data).forEach(function(k) {
            if (allowed.indexOf(k) === -1) { skipped.push(k); return; }
            if (typeof syncPut === "function" && typeof SYNC_BLOB_MAP === "object" && SYNC_BLOB_MAP[k]) {
              syncPut(k, data[k]); // 导入的同步 key 走 syncPut（本地 + 推送云端）
            } else {
              localStorage.setItem(k, PLAIN_STORAGE_KEYS.indexOf(k) !== -1 ? String(data[k]) : JSON.stringify(data[k]));
            }
            count++;
          });
          if (skipped.length) showToast("⚠️ 已跳过 " + skipped.length + " 个非学习数据键（" + skipped.slice(0, 3).join("、") + (skipped.length > 3 ? " 等" : "") + "）");
          showToast("✅ 已导入 " + count + " 项数据，刷新页面后生效");
          closeStats();
          setTimeout(function() { location.reload(); }, 1000);
        } catch (err2) {
          showToast("❌ 导入失败：文件格式错误");
        }
      });
    } catch (err) {
      showToast("❌ 导入失败：文件格式错误");
    }
  };
  reader.readAsText(file);
  input.value = ""; // 重置，允许重复选择同一文件
}

// AI 服务是否可用（由 checkAIService 探测 /ai/status 后设置）
var aiServiceAvailable = true;

// 抽丝训练"已掌握"状态（localStorage 持久化）
var trainingDone = safeParse(localStorage.getItem("korean_training_done"), {});

var ELEM_COLORS = [
  { cls: "elem-stem",               label: "词干/词根", desc: "名词、动词词干" },
  { cls: "elem-particle",           label: "助词",     desc: "은/는, 이/가, 을/를…" },
  { cls: "elem-ending-terminal",    label: "终结词尾",  desc: "-요, -습니다, -다" },
  { cls: "elem-ending-connective",  label: "连接词尾",  desc: "-고, -서, -지만, -면" },
  { cls: "elem-ending-tense",       label: "时态词尾",  desc: "-았/었, -을 거예요, -고 있어요" },
  { cls: "elem-negation",           label: "否定",     desc: "안, 못, -지 않다" },
  { cls: "elem-mood",               label: "语气",     desc: "-세요, -을까요, -죠?" }
];

function getElemClass(b) {
  var tag = b.tag || "";
  var label = b.label || "";
  var meaning = b.meaning || "";
  var part = b.part || "";

  // 否定
  if (label === "否定" || part === "안" || part === "못" || meaning.includes("不能") || meaning.includes("不(否定)")) {
    return "elem-negation";
  }
  // 助词
  if (tag === "助词") {
    return "elem-particle";
  }
  // 词尾分类
  if (tag === "词尾") {
    // 连接
    if (label === "连接" || label === "条件" || meaning.includes("连接") || meaning.includes("因为(连接)") || meaning.includes("但是(连接)")) {
      return "elem-ending-connective";
    }
    // 时态
    if (meaning.includes("过去") || meaning.includes("未来") || meaning.includes("进行") || label === "进行") {
      return "elem-ending-tense";
    }
    // 语气 (命令/提议/疑问)
    if (label === "命令" || label === "提议" || label === "疑问") {
      return "elem-mood";
    }
    // 终结
    return "elem-ending-terminal";
  }
  // 词干/词根 (默认)
  return "elem-stem";
}

// 骨架页用的版本（breakdown 格式是 [text, meaning]）
function getElemClassFromMeaning(meaning) {
  var m = meaning || "";
  // 否定
  if (m.includes("不") || m.includes("不能")) return "elem-negation";
  // 助词（括号里有角色名）
  if (m.includes("主题") || m.includes("主语") || m.includes("宾语") || m.includes("时间") || m.includes("场所") || m.includes("方向") || m.includes("伴随") || m.includes("起点") || m.includes("终点")) {
    return "elem-particle";
  }
  // 连接
  if (m.includes("连接") || m.includes("并且") || m.includes("所以") || m.includes("但是") || m.includes("如果")) {
    return "elem-ending-connective";
  }
  // 时态
  if (m.includes("过去") || m.includes("未来") || m.includes("正在")) {
    return "elem-ending-tense";
  }
  // 语气
  if (m.includes("请") || m.includes("要不要") || m.includes("吧!")) {
    return "elem-mood";
  }
  // 终结词尾
  if (m.includes("敬语") || m.includes("终结") || m.includes("正式")) {
    return "elem-ending-terminal";
  }
  // 词干/词根
  return "elem-stem";
}

function renderColorLegend() {
  var items = ELEM_COLORS.map(function(e) {
    return '<span class="color-legend-item"><span class="color-legend-swatch ' + e.cls + '">' + e.label + '</span><span>' + e.desc + '</span></span>';
  }).join("");
  return '<div class="color-legend">' + items + '</div>';
}

// ============================================
// 拾遗（收藏本）- 用户收藏的词与句（localStorage 先行，Phase 2 上云）
// ============================================
var COLLECTIONS_KEY = "korean_collections";

function getCollections() {
  // Array 防御：localStorage 里被写入 "null"/"{}" 等脏值时不得炸掉统计/拾遗渲染
  // （calcLocalStreak→renderStatsContent 曾因 "null" 整链崩溃，Iteration 008）
  var list = safeParse(localStorage.getItem(COLLECTIONS_KEY), []);
  return Array.isArray(list) ? list : [];
}
function saveCollections(list) {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(list));
}
function isCollected(type, text) {
  return getCollections().some(function(c) { return c.type === type && c.text === text; });
}
// 收藏按钮（去重：同 type+text 幂等）
function collectBtn(type, text, meaning, source, sourceRef) {
  var collected = isCollected(type, text);
  var star = collected ? "★" : "☆";
  return '<button class="collect-btn' + (collected ? " collected" : "") + '" title="收藏到拾遗本" onclick="event.stopPropagation(); collectItem(this, \'' + type + '\', \'' + attrSafe(text) + '\', \'' + attrSafe(meaning || "") + '\', \'' + source + '\', \'' + attrSafe(sourceRef || "") + '\')">' + star + '</button>';
}
function collectItem(btn, type, text, meaning, source, sourceRef) {
  var list = getCollections();
  var dup = list.some(function(c) { return c.type === type && c.text === text; });
  if (dup) { showToast("⭐ 已在拾遗中"); return; }
  var now = Date.now();
  var item = {
    id: "c_" + now + "_" + Math.random().toString(36).slice(2, 8),
    userId: null,
    type: type,
    text: text,
    meaning: meaning || "",
    source: source || "manual",
    sourceRef: sourceRef || "",
    status: "new",
    note: "",
    createdAt: now,
    updatedAt: now
  };
  list.push(item);
  saveCollections(list);
  syncCollect(item); // 已登录 → 推送到云端
  showToast("⭐ 已收藏到拾遗");
  if (btn) { btn.classList.add("collected"); btn.textContent = "★"; }
}

// 拾遗页面状态
var wordListTab = "word";           // word | sentence
var wordListFilter = "all";         // all | new | learning | mastered
var wordListReviewMode = false;     // 抽认卡复习模式
var wordListReviewIdx = 0;          // 当前卡片下标

var SOURCE_LABELS = { skeleton: "筑基", training: "抽丝", stems: "剥茧", ai: "砥砺", scene: "临境", reference: "筑基", manual: "手动" };

function renderWordList() {
  var list = getCollections();
  var wordCount = list.filter(function(c) { return c.type === "word"; }).length;
  var sentCount = list.filter(function(c) { return c.type === "sentence"; }).length;
  var stats = getWordListReviewStats();

  var tabBar =
    '<div class="filter-bar">' +
      '<button class="filter-btn' + (wordListTab === "word" ? " active" : "") + '" onclick="switchWordListTab(\'word\')">词 <span class="badge badge-red">' + wordCount + '</span></button>' +
      '<button class="filter-btn' + (wordListTab === "sentence" ? " active" : "") + '" onclick="switchWordListTab(\'sentence\')">句 <span class="badge badge-green">' + sentCount + '</span></button>' +
    '</div>';

  var statusBar =
    '<div class="filter-bar" style="margin-top:8px;">' +
      '<button class="filter-btn' + (wordListFilter === "all" ? " active" : "") + '" onclick="setWordListFilter(\'all\')">全部</button>' +
      '<button class="filter-btn' + (wordListFilter === "new" ? " active" : "") + '" onclick="setWordListFilter(\'new\')">🆕 新收藏</button>' +
      '<button class="filter-btn' + (wordListFilter === "learning" ? " active" : "") + '" onclick="setWordListFilter(\'learning\')">🔄 学习中</button>' +
      '<button class="filter-btn' + (wordListFilter === "mastered" ? " active" : "") + '" onclick="setWordListFilter(\'mastered\')">✅ 已掌握</button>' +
    '</div>';

  // Phase 4.3 复习进度统计面板
  var statsPanel =
    '<div class="wordlist-stats">' +
      '<div class="wordlist-stat">' +
        '<div class="wordlist-stat-num">' + stats.total + '</div>' +
        '<div class="wordlist-stat-label">累计复习</div>' +
      '</div>' +
      '<div class="wordlist-stat">' +
        '<div class="wordlist-stat-num">' + stats.mastered + '</div>' +
        '<div class="wordlist-stat-label">已掌握</div>' +
      '</div>' +
      '<div class="wordlist-stat">' +
        '<div class="wordlist-stat-num">' + stats.recent7 + '</div>' +
        '<div class="wordlist-stat-label">近 7 天</div>' +
      '</div>' +
      '<div class="wordlist-stat">' +
        '<div class="wordlist-stat-num">' + stats.streak + '</div>' +
        '<div class="wordlist-stat-label">连续复习</div>' +
      '</div>' +
    '</div>' +
    '<div class="mini-bar-chart">' +
      '<div class="mini-bar-chart-label">近 7 天复习量</div>' +
      '<div class="mini-bar-chart-bars">' +
        stats.daily.map(function(d) {
          var h = stats.maxDaily > 0 ? Math.round(d.count / stats.maxDaily * 32) : 0;
          return '<div class="mini-bar-wrap" title="' + d.label + '：' + d.count + '">' +
            '<div class="mini-bar" style="height:' + h + 'px"></div>' +
            '<div class="mini-bar-day">' + d.short + '</div>' +
          '</div>';
        }).join("") +
      '</div>' +
    '</div>' +
    '<div class="wordlist-today">' + (stats.todayDone ? '✅ 今日已复习' : '📅 今日尚未复习') + '</div>';

  var filtered = getWordListFiltered();
  var body;
  if (wordListReviewMode && filtered.length > 0) {
    body = renderWordCard(filtered, wordListReviewIdx);
  } else {
    body = filtered.length === 0
      ? '<p class="scene-empty">还没有收藏。在筑基 / 剥茧 / 抽丝 / 砥砺 / 临境 任意环节点击 ☆ 即可收藏。<br><button class="ai-suggest-btn" style="margin-top:8px;" onclick="navigate(\'skeleton\')">🏗️ 去筑基看看</button></p>'
      : '<div class="wordlist-grid">' + filtered.map(renderWordListCard).join("") + '</div>';
  }

  return '' +
    '<div class="page-title"><h2>🏷️ 拾遗</h2><p>学习时收藏的词与句，学后查漏补缺。点卡片状态按钮流转：新收藏 → 学习中 → 已掌握。</p></div>' +
    tabBar + statusBar +
    statsPanel +
    '<div style="margin:12px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
      '<button class="ai-submit-btn" onclick="startWordListReview()">🎴 复习模式</button>' +
      '<button class="ai-suggest-btn" onclick="exportWordListJSON()">📤 导出 JSON</button>' +
      '<button class="ai-suggest-btn" onclick="exportWordListCSV()">📤 导出 CSV</button>' +
      '<button class="ai-suggest-btn" onclick="openWordListImport()">📥 导入</button>' +
      '<span style="font-size:12px;color:var(--text-light);">共 ' + list.length + ' 条收藏</span>' +
    '</div>' +
    body;
}

function rerenderWordList() {
  // Vue 模式下只重绘拾遗页组件自己的根节点（.wordlist-page-vue），绝不能覆盖 #mainContent
  // —— 那会连同 #vue-root（Vue 挂载点）一起被删除，导致导航全部失效。
  // ⚠️ 竞态修复（Iteration 021）：组件尚未挂载时（快速连续 navigate / 进出复习模式的瞬间）
  // root 为 null，旧兜底直接写 #mainContent 会把 #vue-root 一并抹掉 —— Vue 状态还在但
  // DOM 渲染永久失效（自检实测 vuePage=scene 而页面残留拾遗 HTML，导航"成功"却换页不动）。
  // root 缺失时改走 refreshCurrentPage()：Vue 模式递增 pageTick 让组件重建。
  var root = document.querySelector("#mainContent .wordlist-page-vue");
  if (root) {
    root.innerHTML = renderWordList();
    retriggerPageEnter();
    initRevealObserver();
    return;
  }
  refreshCurrentPage();
}

function switchWordListTab(tab) { wordListTab = tab; wordListReviewMode = false; wordListReviewIdx = 0; rerenderWordList(); }
function setWordListFilter(f) { wordListFilter = f; wordListReviewMode = false; wordListReviewIdx = 0; rerenderWordList(); }

function getWordListFiltered() {
  return getCollections().filter(function(c) {
    if (c.type !== wordListTab) return false;
    if (wordListFilter === "all") return true;
    return c.status === wordListFilter;
  });
}

function setCollectStatus(id, status) {
  var list = getCollections();
  var hit = false;
  list.forEach(function(c) { if (c.id === id) { c.status = status; c.updatedAt = Date.now(); hit = true; } });
  if (hit) {
    saveCollections(list);
    syncCollectStatus(id, status);
    showToast(status === "mastered" ? "✅ 已掌握" : status === "learning" ? "🔄 学习中" : "🆕 新收藏");
  }
  rerenderWordList();
}
function deleteCollect(id) {
  bkConfirm("确定删除这条收藏？", function() {
    // 删除前先拿到该条目的 type/text（syncCollectDelete 需要它们记录删除墓碑，防止离线删除被服务端复活）
    var target = getCollections().filter(function(c) { return c.id === id; })[0];
    saveCollections(getCollections().filter(function(c) { return c.id !== id; }));
    syncCollectDelete(id, target ? target.type : "", target ? target.text : "");
    showToast("🗑 已删除");
    rerenderWordList();
  });
}

function renderWordListCard(c) {
  var sourceLabel = SOURCE_LABELS[c.source] || c.source;
  var curStatus = c.status || "new";
  // 三态流转按钮：当前状态高亮。旧版只有「学习中/掌握」两个按钮且与删除混排，
  // 现在删除拆到右上角（.wl-delete），状态三选一独立成行（.wl-actions）。
  function st(label, status) {
    var active = curStatus === status;
    return '<button class="wl-status-btn' + (active ? " active" : "") + '" onclick="setCollectStatus(\'' + c.id + '\',\'' + status + '\')">' + label + '</button>';
  }
  return '<div class="wordlist-card">' +
    '<button class="wl-delete" title="删除" aria-label="删除这条收藏" onclick="deleteCollect(\'' + c.id + '\')">🗑</button>' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-right:28px;">' +
      '<span class="wl-badge ' + (c.type === "word" ? "wl-badge-word" : "wl-badge-sentence") + '">' + (c.type === "word" ? "词" : "句") + '</span>' +
      '<span style="font-size:11px;color:var(--text-light);">' + escapeHtml(sourceLabel) + (c.sourceRef ? " · " + escapeHtml(c.sourceRef) : "") + '</span>' +
    '</div>' +
    '<div class="wl-text">' + escapeHtml(c.text) + '</div>' +
    (c.meaning ? '<div class="wl-mean">' + escapeHtml(c.meaning) + '</div>' : "") +
    '<div class="wl-actions">' +
      st("🆕 新收藏", "new") +
      st("🔄 学习中", "learning") +
      st("✅ 已掌握", "mastered") +
    '</div>' +
  '</div>';
}

function startWordListReview() {
  var list = getWordListFiltered();
  if (!list.length) { showToast("没有可复习的收藏"); return; }
  wordListReviewMode = true; wordListReviewIdx = 0;
  rerenderWordList();
}
function exitWordListReview() { wordListReviewMode = false; wordListReviewIdx = 0; rerenderWordList(); }
function nextWordCard() {
  var list = getWordListFiltered();
  if (!list.length) { exitWordListReview(); showToast("没有可复习的收藏"); return; }
  wordListReviewIdx = (wordListReviewIdx + 1) % list.length;
  rerenderWordList();
}
function prevWordCard() {
  var list = getWordListFiltered();
  if (!list.length) return;
  wordListReviewIdx = (wordListReviewIdx - 1 + list.length) % list.length;
  rerenderWordList();
}
function flipWordCard(card) { card.classList.toggle("flipped"); }
function reviewMark(id, status) {
  setCollectStatus(id, status);
  // Phase 4.3：记一次复习。只在这里记，nextWordCard（翻下一张）不记 ——
  // 「翻过」不等于「复习过」，否则连点下一张就能把统计刷满，数字就没意义了。
  recordWordListReview(id);
  nextWordCard();
}
function renderWordCard(list, idx) {
  if (!list.length) return '<p class="scene-empty">没有可复习的收藏<br><button class="ai-suggest-btn" style="margin-top:8px;" onclick="exitWordListReview()">← 返回列表</button></p>';
  var c = list[idx % list.length];
  // 场次进度条（条纹流动 = 进行中，借鉴 Uiverse soft-termite-38，配色走项目 token）
  var pct = list.length > 0 ? Math.round(((idx + 1) / list.length) * 100) : 0;
  return '<div class="flashcard-wrap">' +
    '<div class="review-progress">' +
      '<div class="review-progress-head"><span>第 ' + (idx + 1) + ' / ' + list.length + ' 条 · ' + (c.type === "word" ? "词" : "句") + '</span><span class="review-pct">' + pct + '%</span></div>' +
      '<div class="review-track" role="progressbar" aria-label="本场复习进度" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
        '<div class="review-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
    '</div>' +
    '<div class="flashcard" role="button" tabindex="0" aria-label="抽认卡，点击或按空格翻面" onclick="flipWordCard(this)" onkeydown="if(event.key===\'Enter\'){ event.preventDefault(); flipWordCard(this); }">' +
      '<div class="flashcard-inner">' +
        '<div class="flashcard-face flashcard-front">' +
          '<div style="font-size:24px;font-weight:500;font-family:\'Noto Sans KR\',sans-serif;padding:20px;text-align:center;word-break:break-all;">' + escapeHtml(c.text) + playBtn(c.text, "small") + '</div>' +
          '<div style="position:absolute;bottom:10px;width:100%;text-align:center;font-size:11px;color:var(--text-light);">👆 点击翻面看含义</div>' +
        '</div>' +
        '<div class="flashcard-face flashcard-back">' +
          '<div style="font-size:18px;padding:20px;text-align:center;">' + escapeHtml(c.meaning || "（无含义）") + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap;">' +
      '<button class="ai-suggest-btn" onclick="reviewMark(\'' + c.id + '\',\'learning\')">🔄 学习中</button>' +
      '<button class="ai-suggest-btn" onclick="reviewMark(\'' + c.id + '\',\'mastered\')">✅ 已掌握</button>' +
      '<button class="ai-suggest-btn" onclick="prevWordCard()">← 上一张</button>' +
      '<button class="ai-submit-btn" onclick="nextWordCard()">下一张 →</button>' +
      '<button class="ai-suggest-btn" onclick="exitWordListReview()">退出</button>' +
    '</div>' +
  '</div>';
}

// ============================================
// 拾遗 · 复习进度统计 + 导出导入（Phase 4.3）
// ============================================
// Iteration 014 起复习日志已接入云同步（blob key wordlist_review_log，set 型按 id+time 并集，
// 见 js/sync.js）——它是 append-only 流水，无墓碑语义，过期仍走 90 天本地修剪；
// 导出/导入保留（导出的包里带 reviewLog，跨账号迁移用）。
var WORDLIST_REVIEW_LOG_KEY = "korean_wordlist_review_log";
var WORDLIST_LOG_KEEP_DAYS = 90;
// 单次导入最多往云端推多少条（后端是逐条 POST，防止一次导入打爆请求队列）
var WORDLIST_IMPORT_PUSH_LIMIT = 50;

function getWordListReviewLog() {
  var raw = safeParse(localStorage.getItem(WORDLIST_REVIEW_LOG_KEY), []);
  return Array.isArray(raw) ? raw : [];
}
// 记一次复习。只保留 90 天窗口，避免 localStorage 随时间无限膨胀。
function recordWordListReview(id) {
  if (!id) return;
  var cutoff = Date.now() - WORDLIST_LOG_KEEP_DAYS * 86400000;
  var log = getWordListReviewLog().filter(function(e) { return e && e.time >= cutoff; });
  log.push({ id: id, time: Date.now() });
  // Iteration 014：复习日志接入云同步（blob key wordlist_review_log，set 型按 id+time 并集）。
  // syncPut 写本地 + 登录时触脏调度推送；未登录时它只写本地，行为与旧版一致。
  if (typeof syncPut === "function") syncPut(WORDLIST_REVIEW_LOG_KEY, log);
  else localStorage.setItem(WORDLIST_REVIEW_LOG_KEY, JSON.stringify(log));
}
// 本地日期键（用本地时区而非 UTC：学习行为按用户所在日历天算才符合直觉）
function dayKeyOf(ts) {
  var d = new Date(ts);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
// 复习统计：累计 / 已掌握 / 近 7 天 / 连续天数 / 近 7 天每日量 / 今日是否已复习
function getWordListReviewStats() {
  var log = getWordListReviewLog();
  var list = getCollections();
  var mastered = list.filter(function(c) { return c.status === "mastered"; }).length;
  var DAY_MS = 86400000;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  // 近 7 天（含今天）每日计数，按时间正序：左旧 → 右新
  var daily = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today.getTime() - i * DAY_MS);
    daily.push({
      key: dayKeyOf(d.getTime()),
      label: (d.getMonth() + 1) + "月" + d.getDate() + "日",
      short: "日一二三四五六".charAt(d.getDay()),
      count: 0
    });
  }
  var pos = {};
  daily.forEach(function(x, i) { pos[x.key] = i; });
  var recent7 = 0;
  log.forEach(function(e) {
    if (!e || !e.time) return;
    var i = pos[dayKeyOf(e.time)];
    if (i === undefined) return;
    daily[i].count++;
    recent7++;
  });
  var maxDaily = daily.reduce(function(m, x) { return Math.max(m, x.count); }, 0);
  // 连续复习天数：今天还没复习就从昨天起算 —— 否则每到零点刚过时 streak 归零很打击人
  var active = {};
  log.forEach(function(e) { if (e && e.time) active[dayKeyOf(e.time)] = true; });
  var streak = 0;
  var cur = new Date(today);
  if (!active[dayKeyOf(cur.getTime())]) cur = new Date(cur.getTime() - DAY_MS);
  while (active[dayKeyOf(cur.getTime())]) {
    streak++;
    cur = new Date(cur.getTime() - DAY_MS);
  }
  return {
    total: log.length,
    mastered: mastered,
    recent7: recent7,
    streak: streak,
    daily: daily,
    maxDaily: maxDaily,
    todayDone: !!active[dayKeyOf(today.getTime())]
  };
}

// 通用下载：把内容包成 Blob 触发浏览器下载
function downloadFile(content, filename, mime) {
  var blob = new Blob([content], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
// 文件名时间戳：20260830-1905
function fileStamp() {
  var d = new Date();
  function p(n) { return (n < 10 ? "0" : "") + n; }
  return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}
function exportWordListJSON() {
  var list = getCollections();
  var payload = {
    app: "basic-korean",
    kind: "wordlist",
    version: 1,
    exportedAt: new Date().toISOString(),
    reviewLog: getWordListReviewLog(),
    items: list
  };
  downloadFile(JSON.stringify(payload, null, 2), "korean_wordlist_" + fileStamp() + ".json", "application/json;charset=utf-8");
  showToast("✅ 已导出 " + list.length + " 条收藏（JSON）");
}
// CSV 单元格转义（RFC 4180）：含分隔符/引号/换行就加引号，内部引号翻倍
function csvCell(v) {
  var s = (v === null || v === undefined) ? "" : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function exportWordListCSV() {
  var list = getCollections();
  var head = ["type", "text", "meaning", "status", "source", "sourceRef", "note", "createdAt", "updatedAt", "createdAtISO"];
  var rows = list.map(function(c) {
    return [
      c.type, c.text, c.meaning || "", c.status || "new", c.source || "", c.sourceRef || "",
      c.note || "", c.createdAt || "", c.updatedAt || "",
      c.createdAt ? new Date(c.createdAt).toISOString() : ""
    ].map(csvCell).join(",");
  });
  // BOM 开头：没有它 Excel 会把韩文/中文识别成 ANSI 而乱码
  var csv = "\ufeff" + head.join(",") + "\n" + rows.join("\n") + "\n";
  downloadFile(csv, "korean_wordlist_" + fileStamp() + ".csv", "text/csv;charset=utf-8");
  showToast("✅ 已导出 " + list.length + " 条收藏（CSV）");
}

function openWordListImport() {
  var old = document.getElementById("wordlistImportOverlay");
  if (old) old.remove();
  var overlay = document.createElement("div");
  overlay.className = "stats-overlay";
  overlay.id = "wordlistImportOverlay";
  overlay.onclick = function(e) { if (e.target === overlay) closeWordListImport(); };
  overlay.innerHTML = '' +
    '<div class="stats-modal">' +
      '<button class="stats-close" onclick="closeWordListImport()">✕</button>' +
      '<h2>📥 导入收藏</h2>' +
      '<p style="font-size:13px;color:var(--text-light);line-height:1.6;margin:0 0 4px;">' +
        '支持本页导出的 JSON（含复习记录）或 CSV。' +
      '</p>' +
      '<p style="font-size:13px;color:var(--text-light);line-height:1.6;margin:0;">' +
        '合并口径：' +
        '<strong>同类型 + 同文本</strong>视为同一条 —— 已存在则只在新数据更新时覆盖，不存在则新增。' +
        '不会删除你现有的任何收藏。' +
      '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">' +
        '<button class="ai-submit-btn" onclick="document.getElementById(\'wordlistImportFile\').click()">📂 选择文件</button>' +
        '<button class="ai-suggest-btn" onclick="closeWordListImport()">取消</button>' +
      '</div>' +
      '<input type="file" id="wordlistImportFile" accept=".json,.csv,text/csv,application/json" style="display:none" onchange="importWordListFromFile(this)" />' +
    '</div>';
  document.body.appendChild(overlay);
}
function closeWordListImport() {
  var el = document.getElementById("wordlistImportOverlay");
  if (el) el.remove();
}
// 极简 CSV 解析器：支持引号包裹字段、字段内换行、"" 转义。
// 够用于本页导出的 CSV 与 Excel 另存的常规 CSV；不做类型推断，全部按字符串处理。
function parseCSV(text) {
  var rows = [];
  var row = [], cur = "", inQ = false;
  text = String(text).replace(/^\ufeff/, "");
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (inQ) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch === "\r") { /* 跳过：统一由 \n 收行，兼容 CRLF */ }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  // 丢掉全空行（CSV 末尾换行会产生一个空行）
  return rows.filter(function(r) {
    return r.some(function(c) { return String(c).trim() !== ""; });
  });
}
function importWordListFromFile(input) {
  var file = input.files && input.files[0];
  input.value = ""; // 清空：否则连续导入同一个文件不会再触发 change
  if (!file) return;
  var reader = new FileReader();
  reader.onerror = function() { showToast("❌ 文件读取失败"); };
  reader.onload = function(e) {
    var items = [], log = [];
    try {
      var text = String(e.target.result);
      if (/\.json$/i.test(file.name)) {
        var data = JSON.parse(text);
        // 兼容两种形态：本页导出的完整包 {items:[...]}，或早期 exportWordList 导出的裸数组
        items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
        if (!items) throw new Error("JSON 里找不到收藏列表（缺 items 字段）");
        if (!Array.isArray(data) && Array.isArray(data.reviewLog)) log = data.reviewLog;
      } else {
        var rows = parseCSV(text);
        if (!rows.length) throw new Error("CSV 是空的");
        var head = rows[0].map(function(h) { return String(h).trim(); });
        if (head.indexOf("type") < 0 || head.indexOf("text") < 0) throw new Error("CSV 缺少 type / text 列");
        items = rows.slice(1).map(function(r) {
          function g(name, dft) {
            var i = head.indexOf(name);
            return (i < 0 || r[i] === undefined) ? dft : r[i];
          }
          var created = Number(g("createdAt", ""));
          if (!created) {
            var iso = String(g("createdAtISO", "")).trim();
            var parsed = iso ? Date.parse(iso) : NaN;
            created = isNaN(parsed) ? Date.now() : parsed;
          }
          return {
            type: String(g("type", "word")).trim(),
            text: String(g("text", "")).trim(),
            meaning: String(g("meaning", "")),
            status: String(g("status", "new")).trim(),
            source: String(g("source", "manual")).trim() || "manual",
            sourceRef: String(g("sourceRef", "")),
            note: String(g("note", "")),
            createdAt: created,
            updatedAt: Number(g("updatedAt", "")) || created
          };
        });
      }
    } catch (err) {
      showToast("❌ 导入失败：" + (err && err.message ? err.message : "文件解析出错"));
      return;
    }
    // 归一化：type/status 只接受白名单值，脏数据一律落到安全默认
    var VALID_STATUS = ["new", "learning", "mastered"];
    items = items.map(function(it) {
      return {
        type: it.type === "sentence" ? "sentence" : "word",
        text: String(it.text || "").trim(),
        meaning: String(it.meaning || ""),
        status: VALID_STATUS.indexOf(it.status) >= 0 ? it.status : "new",
        source: String(it.source || "manual") || "manual",
        sourceRef: String(it.sourceRef || ""),
        note: String(it.note || ""),
        createdAt: Number(it.createdAt) || Date.now(),
        updatedAt: Number(it.updatedAt) || Number(it.createdAt) || Date.now()
      };
    }).filter(function(c) { return !!c.text; });

    if (!items.length) { showToast("❌ 没有可导入的收藏"); return; }

    // 合并：同 type+text 视为同一条（与 collectItem 的去重口径一致）
    var cur = getCollections();
    var byKey = {};
    cur.forEach(function(c) { byKey[c.type + "\u0000" + c.text] = c; });
    var added = [], updated = 0;
    items.forEach(function(it) {
      var key = it.type + "\u0000" + it.text;
      var exist = byKey[key];
      if (exist) {
        // 已存在：导入的数据必须比本地新才覆盖 —— 一份旧备份不该把本地最新的掌握状态打回去
        if (it.updatedAt <= (Number(exist.updatedAt) || 0)) return;
        if (it.meaning) exist.meaning = it.meaning;
        if (it.status) exist.status = it.status;
        if (it.note) exist.note = it.note;
        if (it.sourceRef) exist.sourceRef = it.sourceRef;
        exist.updatedAt = it.updatedAt;
        updated++;
      } else {
        var now = Date.now();
        var item = {
          id: "c_" + now + "_" + Math.random().toString(36).slice(2, 8),
          userId: null,
          type: it.type,
          text: it.text,
          meaning: it.meaning,
          source: it.source,
          sourceRef: it.sourceRef,
          status: it.status,
          note: it.note,
          createdAt: it.createdAt,
          updatedAt: it.updatedAt
        };
        cur.push(item);
        byKey[key] = item;
        added.push(item);
      }
    });
    saveCollections(cur);

    // 复习日志合并：按 id+time 去重，只补本地没有的
    var logAdded = 0;
    if (log.length) {
      var curLog = getWordListReviewLog();
      var seen = {};
      curLog.forEach(function(x) { seen[x.id + "@" + x.time] = true; });
      log.forEach(function(x) {
        if (!x || !x.id || !x.time) return;
        var k = x.id + "@" + x.time;
        if (seen[k]) return;
        seen[k] = true;
        curLog.push({ id: x.id, time: Number(x.time) || Date.now() });
        logAdded++;
      });
      // 与 sync 的 set 型合并同键（id@time），导入后触脏上云（Iteration 014）
      if (logAdded) {
        if (typeof syncPut === "function") syncPut(WORDLIST_REVIEW_LOG_KEY, curLog);
        else localStorage.setItem(WORDLIST_REVIEW_LOG_KEY, JSON.stringify(curLog));
      }
    }

    // 已登录 → 把新增条目推上云端（服务端按 type+text 幂等，重复推无害）
    var pushed = 0;
    if (typeof isLoggedIn === "function" && isLoggedIn() && typeof syncCollect === "function") {
      added.slice(0, WORDLIST_IMPORT_PUSH_LIMIT).forEach(function(item) { syncCollect(item); pushed++; });
    }

    closeWordListImport();
    var msg = "✅ 导入完成：新增 " + added.length + " 条，更新 " + updated + " 条";
    if (logAdded) msg += "，补录 " + logAdded + " 条复习记录";
    if (pushed) msg += "（已推 " + pushed + " 条上云）";
    else if (added.length > WORDLIST_IMPORT_PUSH_LIMIT) msg += "（新增过多，仅前 " + WORDLIST_IMPORT_PUSH_LIMIT + " 条上云）";
    showToast(msg);
    rerenderWordList();
  };
  reader.readAsText(file, "utf-8");
}

// 筑基·词的助记 / 表格行渲染（与 REFERENCE 数据源共用，避免两处漂移）
function refLevelBadge(lv) {
  var cls = lv === "核心" ? "level-badge-core" : lv === "常用" ? "level-badge-common" : "level-badge-optional";
  return '<span class="' + cls + '">' + lv + '</span>';
}
function refEndingCls(e) {
  var m = e.meaning || "", t = e.type || "";
  if (m.includes("过去") || m.includes("未来") || m.includes("正在")) return "elem-ending-tense";
  if (t.includes("连接")) return "elem-ending-connective";
  if (t.includes("命令") || t.includes("提议") || t.includes("疑问") || t.includes("确认") || t.includes("请求") || t.includes("征求") || t.includes("感慨")) return "elem-mood";
  return "elem-ending-terminal";
}
function refParticleRow(p, src) {
  return '<tr class="ref-row">' +
    '<td><span class="elem-tag elem-particle" style="font-size:14px;padding:2px 10px;border-radius:99px;">' + p.tag + '</span></td>' +
    '<td>' + p.type + '</td><td>' + p.meaning + '</td><td>' + refLevelBadge(p.level) + '</td>' +
    '<td style="font-size:13px;color:var(--text-light);">' + p.example + playBtn(p.example, "small") + '</td>' +
    (src ? '<td>' + collectBtn("word", p.tag, p.type + "：" + p.meaning, src, "particle:" + p.tag) + '</td>' : '') +
  '</tr>';
}
function refEndingRow(e, src) {
  return '<tr class="ref-row">' +
    '<td><span class="elem-tag ' + refEndingCls(e) + '" style="font-size:14px;padding:2px 10px;border-radius:99px;">' + e.tag + '</span></td>' +
    '<td>' + e.type + '</td><td>' + e.meaning + '</td><td>' + refLevelBadge(e.level) + '</td>' +
    '<td style="font-size:13px;color:var(--text-light);">' + e.example + playBtn(e.example, "small") + '</td>' +
    (src ? '<td>' + collectBtn("word", e.tag, e.type + "：" + e.meaning, src, "ending:" + e.tag) + '</td>' : '') +
  '</tr>';
}
function refQwordChip(q, src) {
  return '<span class="ref-qword" style="display:inline-block;padding:6px 14px;background:var(--bg);border-radius:8px;margin:4px;border:1px solid var(--border);">' +
    '<strong style="font-size:18px;font-family:\'Noto Sans KR\',sans-serif;">' + q.word + '</strong>' + playBtn(q.word, "small") +
    '<span style="color:var(--text-light);margin-left:6px;font-size:13px;">= ' + q.meaning + '</span>' +
    (src ? collectBtn("word", q.word, "疑问词：" + q.meaning, src, "qword:" + q.word) : '') +
  '</span>';
}

// ============================================
// 骨架规则映射 - 拆解项 → 筑基规则编号
// ============================================
var RULE_MAP = {
  1: { icon: "①", name: "主宾谓", color: "#1565C0" },
  2: { icon: "②", name: "助词", color: "#C62828" },
  3: { icon: "③", name: "时态", color: "#E65100" },
  4: { icon: "④", name: "敬语", color: "#5B2C8F" },
  5: { icon: "⑤", name: "连接", color: "#2E7D32" },
  6: { icon: "⑥", name: "否定", color: "#6A1B9A" },
  7: { icon: "⑦", name: "语气", color: "#00838F" }
};

function getRuleTag(b) {
  var tag = b.tag || "";
  var label = b.label || "";
  var meaning = b.meaning || "";
  var part = b.part || "";

  // ⑥ 否定
  if (label.includes("否定") || part === "안" || part === "못" || meaning.includes("不能") || meaning.includes("不(否定)")) {
    return 6;
  }
  // ⑤ 连接词尾
  if (label.includes("连接") || label.includes("条件") || meaning.includes("连接") || meaning.includes("因为(连接)") || meaning.includes("但是(连接)")) {
    return 5;
  }
  // ⑦ 疑问/命令/提议
  if (label.includes("命令") || label.includes("提议") || label.includes("疑问") || meaning.includes("要不要") || meaning.includes("请") || meaning.includes("吧!")) {
    return 7;
  }
  // ② 助词
  if (tag === "助词") {
    return 2;
  }
  // ③ 时态
  if (meaning.includes("过去") || meaning.includes("未来") || meaning.includes("进行") || meaning.includes("正在")) {
    return 3;
  }
  // ④ 敬语
  if (meaning.includes("敬语") || meaning.includes("正式敬语") || part.endsWith("습니다") || part.endsWith("세요") || part.endsWith("습니다.") || part.endsWith("비다")) {
    return 4;
  }
  // ① 主宾谓 (词干/名词)
  return 1;
}

function ruleBadge(ruleNum) {
  var r = RULE_MAP[ruleNum];
  return '<span onclick="event.stopPropagation(); jumpToRule(' + ruleNum + ')" style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + r.color + '20;color:' + r.color + ';font-weight:600;margin-left:4px;white-space:nowrap;cursor:pointer;" title="跳转到筑基规则 ' + ruleNum + '">' + r.icon + ' ' + r.name + '</span>';
}

// ============================================
// Web Speech API - 韩语语音播放
// ============================================

// 音频缓存（已生成的就不重复请求）
var audioCache = {};
var ttsAvailable = null; // null=未检测, true=可用, false=不可用
var TTS_CACHE_NAME = "bk-tts-v1"; // P1-9 前端持久缓存（Cache API，跨刷新仍命中）

// 获取用户选择的 TTS 语音
function getVoice() {
  return localStorage.getItem("korean_voice") || "ko-KR-SunHiNeural";
}
function setVoice(voice) {
  localStorage.setItem("korean_voice", voice);
  showToast("已切换语音，下次播放时生效");
}

function ttsRequestUrl(text) {
  return (TTS_BASE || "") + "/tts?text=" + encodeURIComponent(text) + "&voice=" + encodeURIComponent(getVoice());
}

// P1-9：TTS 双层缓存——① 内存 audioCache ② Cache API 持久缓存（跨刷新）。
// 不支持 Cache API 的旧浏览器回退为内存缓存 + 直连 Audio。
function speakKorean(text) {
  if (!text) return;
  var url = ttsRequestUrl(text);
  var remote = !TTS_BASE; // 远程部署：降级时静默走 Web Speech（不打扰）

  function fallbackToSpeech() {
    if (ttsAvailable === null) ttsAvailable = false;
    if (window.speechSynthesis) {
      var utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ko-KR";
      utter.rate = 0.9;
      speechSynthesis.speak(utter);
      if (!remote) showToast("TTS 服务未启动，使用浏览器内置语音（音质较低）");
    } else if (!remote) {
      showToast("⚠️ 无法播放音频，请启动 TTS 服务：node tts_server.js");
    }
  }

  // 内存缓存直接播
  if (audioCache[text]) { audioCache[text].play(); return; }

  // Cache API 持久缓存仅用于同源（生产部署）：fetch 跨域需 CORS，本地 dev 用直连 Audio 更稳。
  // 命中→blob→objectURL 播放；未命中→fetch 并写入。
  if (!TTS_BASE && window.caches && typeof caches.open === "function") {
    caches.open(TTS_CACHE_NAME).then(function(cache) {
      return cache.match(url).then(function(hit) {
        if (hit && hit.ok) return hit;
        return fetch(url).then(function(resp) {
          if (resp && resp.ok) { try { cache.put(url, resp.clone()); } catch (e) {} }
          return resp;
        });
      });
    }).then(function(resp) {
      if (!resp || !resp.ok) throw new Error("tts " + (resp && resp.status));
      return resp.blob();
    }).then(function(blob) {
      var objUrl = URL.createObjectURL(blob);
      var audio = new Audio(objUrl);
      audio.play();
      audioCache[text] = audio;
      ttsAvailable = true;
    }).catch(fallbackToSpeech);
    return;
  }

  // 旧浏览器：内存缓存 + 直连 Audio
  var audio = new Audio(url);
  audio.addEventListener("canplaythrough", function() { ttsAvailable = true; });
  audio.addEventListener("error", fallbackToSpeech);
  audioCache[text] = audio;
  audio.play();
}

function showToast(msg) {
  var existing = document.querySelector(".toast");
  if (existing) existing.remove();
  var toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.classList.add("show"); }, 10);
  setTimeout(function() {
    toast.classList.remove("show");
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// P1-1 自定义确认框：替代原生 confirm()，样式与全站设计系统一致（stats-modal 复用）
// 用法：bkConfirm(message, function() { /* 确定后的回调 */ })
var bkConfirmShown = false;
function bkConfirm(message, onOk) {
  if (bkConfirmShown) return; // 防重复弹层
  bkConfirmShown = true;
  var overlay = document.createElement("div");
  overlay.className = "stats-overlay";
  overlay.id = "bkConfirmOverlay";
  overlay.innerHTML =
    '<div class="stats-modal bk-confirm-modal" role="alertdialog" aria-modal="true" aria-label="确认操作">' +
      '<button class="stats-close" onclick="closeBkConfirm()" aria-label="取消">✕</button>' +
      '<h2>⚠️ 确认操作</h2>' +
      '<p class="bk-confirm-msg">' + escapeHtml(message) + '</p>' +
      '<div class="bk-confirm-actions">' +
        '<button class="ai-suggest-btn" onclick="closeBkConfirm()">取消</button>' +
        '<button class="ai-submit-btn" id="bkConfirmOk" onclick="bkConfirmOk()">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  window._bkConfirmOnOk = onOk || function() {};
  // 默认聚焦「取消」：破坏性操作防误触（Enter 不会误确认）。focusModal 同时记住打开者
  focusModal(overlay, ".bk-confirm-actions .ai-suggest-btn");
  return overlay;
}
function closeBkConfirm() {
  var el = document.getElementById("bkConfirmOverlay");
  if (el) el.remove();
  bkConfirmShown = false;
  window._bkConfirmOnOk = null;
  restoreModalFocus();
}
function bkConfirmOk() {
  var cb = window._bkConfirmOnOk;
  closeBkConfirm();
  if (cb) cb();
}
// ESC 关闭确认框 / 移动端抽屉 / 快捷键面板；Tab 在打开的弹窗内循环（焦点陷阱）
function initBkConfirmKey() {
  document.addEventListener("keydown", function(e) {
    if (e.key !== "Escape") {
      // 焦点陷阱：Tab/Shift+Tab 在弹窗内循环，不逃逸到背景内容（Iteration 013）
      if (e.key !== "Tab") return;
      var ov = document.getElementById("shortcutsOverlay") || document.getElementById("statsOverlay") || document.getElementById("bkConfirmOverlay");
      if (!ov) return;
      var els = ov.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!els.length) return;
      var cur = document.activeElement;
      if (e.shiftKey) {
        if (cur === els[0] || !ov.contains(cur)) { e.preventDefault(); els[els.length - 1].focus(); }
      } else if (cur === els[els.length - 1] || !ov.contains(cur)) { e.preventDefault(); els[0].focus(); }
      return;
    }
    if (document.getElementById("bkConfirmOverlay")) closeBkConfirm();
    if (document.getElementById("shortcutsOverlay")) toggleShortcutsHelp();
    closeMobileDrawer();
  });
}

// ---- 弹窗焦点管理（Iteration 013）：打开时移入焦点并记住打开者，关闭时归还 ----
var _modalReturnFocus = null;
function focusModal(overlay, preferredSelector) {
  _modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  var target = (preferredSelector && overlay.querySelector(preferredSelector)) || overlay.querySelector("button:not([disabled])");
  if (target) target.focus();
}
function restoreModalFocus() {
  if (_modalReturnFocus && document.body.contains(_modalReturnFocus)) _modalReturnFocus.focus();
  _modalReturnFocus = null;
}

function playBtn(text, size) {
  var sizeStyle = size === "small" ? "font-size:14px;padding:2px 8px;" : "font-size:16px;padding:4px 12px;";
  var encoded = encodeURIComponent(text);
  return '<button class="korean-speak-btn" data-text="' + encoded + '" onclick="event.stopPropagation(); speakKorean(decodeURIComponent(this.getAttribute(\'data-text\')))" style="' + sizeStyle + 'background:var(--primary);color:white;border:none;border-radius:6px;cursor:pointer;margin-left:8px;vertical-align:middle;line-height:1.4;font-family:inherit;" title="点击播放韩语发音">🔊</button>';
}
var revealObserver = null;
var currentPage = "home";

// 重新触发入场动效。
// ⚠️ 目标元素必须是 .main（#mainContent）本身，不是页面组件根节点：CSS 选择器写作
// `.main.page-enter > *` / `.main.page-enter .hero-card`，要求 .main 与 .page-enter
// 落在同一个元素上。历史上 switchSkeletonTab / 词句表重绘 / 抽丝重绘把 class 挂到了
// `.xxx-page-vue` 根节点，选择器永不匹配，那几处动画是死的——统一走本函数杜绝复发。
// reduced-motion 由 css/style.css 的全局 @media (prefers-reduced-motion: reduce) 兜底。
function retriggerPageEnter() {
  var main = document.getElementById("mainContent");
  if (!main) return;
  main.classList.remove("page-enter");
  void main.offsetWidth; // force reflow，确保动画从头播放
  main.classList.add("page-enter");
}

function navigate(page) {
  // 关闭移动端抽屉（无论 Vue 是否激活都要执行）
  closeMobileDrawer();

  currentPage = page;
  document.querySelectorAll(".nav-item").forEach(el => {
    var match = el.dataset.page === page || (page === "sceneChat" && el.dataset.page === "scene");
    el.classList.toggle("active", match);
    // P1-5 可访问性：当前页导航项标记 aria-current
    if (match) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });

  // 如果 Vue 已激活，委托路由并异步执行页面副作用
  if (window.vueApp && typeof window.vueApp.navigate === 'function') {
    // 入场动效（P0 修复）：Vue 分支此前直接走 setTimeout 后 return，从不给 #mainContent
    // 挂 page-enter，导致 css/style.css 里整套 .main.page-enter * 动画在线上从不触发，
    // 页面切换是硬切。做法：切页前先摘掉 class，等 Vue 完成 DOM 更新（nextTick）后
    // 强制回流再挂回去，重新触发动画。reduced-motion 由 CSS 全局兜底。
    var vueMain = document.getElementById("mainContent");
    if (vueMain) vueMain.classList.remove("page-enter");

    window.vueApp.navigate(page);

    if (window.Vue && typeof window.Vue.nextTick === "function") {
      window.Vue.nextTick(retriggerPageEnter);
    }

    // 等 Vue 渲染完成后再执行页面副作用（动画/滚动/规则跳转/交叉观察）
    setTimeout(function() {
      var main = document.getElementById("mainContent");
      if (!main) return;

      // 滚动到顶部
      window.scrollTo({ top: 0, behavior: "smooth" });

      // 列表项错落延迟动画
      var items = main.querySelectorAll(".sentence-card, .stem-item, .day-card, .rule-item, .card");
      items.forEach(function(item, i) {
        item.style.animationDelay = Math.min(i * 0.04, 0.6) + "s";
      });

      // 启动滚动入场动效
      initRevealObserver();

      // 骨架规则跳转
      if (pendingRule !== null && page === "skeleton") {
        var idx = pendingRule - 1;
        setTimeout(function() {
          var ruleHeader = document.querySelector(".rule-header");
          if (ruleHeader) {
            ruleHeader.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          pendingRule = null;
        }, 100);
      }
    }, 200);
    return;
  }

  // 非 Vue 模式：传统 innerHTML 渲染 + 动效
  var main = document.getElementById("mainContent");

  // Fade out
  main.style.opacity = "0";
  main.style.transform = "translateY(8px)";
  main.style.transition = "opacity 150ms ease, transform 150ms ease";

  setTimeout(function() {
    main.innerHTML = renderPage(page);
    // 重新触发入场动效
    retriggerPageEnter();
    // 列表项错落延迟
    var items = main.querySelectorAll(".sentence-card, .stem-item, .day-card, .rule-item, .card");
    items.forEach(function(item, i) {
      item.style.animationDelay = Math.min(i * 0.04, 0.6) + "s";
    });
    // 启动滚动入场动效
    initRevealObserver();
    window.scrollTo({ top: 0, behavior: "smooth" });
    // 骨架规则跳转：展开并滚动到目标规则
    if (pendingRule !== null && page === "skeleton") {
      var idx = pendingRule - 1;
      setTimeout(function() {
        var body = document.getElementById("ruleBody" + idx);
        if (body) {
          body.classList.add("open");
          if (body.previousElementSibling) body.previousElementSibling.classList.add("open");
          body.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        pendingRule = null;
      }, 100);
    }

    // Fade in
    requestAnimationFrame(function() {
      main.style.opacity = "1";
      main.style.transform = "translateY(0)";
    });
  }, 150);
}

// 强制刷新当前页面（改数据后调用）：Vue 模式递增 pageTick 使 :key 变化 → 组件重建 → 重新渲染；
// 传统模式回退为 navigate(currentPage)。
// ⚠️ 不能用 navigate(当前页)：currentPage 值不变时 Vue 不会重渲染（clearData/保存删除自定义场景后界面不更新）。
function refreshCurrentPage() {
  if (window.vueApp && typeof window.vueApp.refreshPage === 'function') {
    window.vueApp.refreshPage();
    return;
  }
  navigate(currentPage);
}

function initRevealObserver() {
  if (revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  // 滚动入场观察器（预留，当前未使用 .reveal 类）
}

// 卡片 hover 光晕跟随鼠标
function initCardGlow() {
  document.addEventListener("mousemove", function(e) {
    var card = e.target.closest(".hero-card, .card, .sentence-card");
    if (card) {
      var rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width * 100) + "%");
      card.style.setProperty("--my", ((e.clientY - rect.top) / rect.height * 100) + "%");
    }
  });
}

// ---- 移动导航抽屉（Uiverse drawer 模式）----
// 抽屉 + 遮罩由 CSS（max-width:768px 媒体块）负责形态，JS 只管开合与生命周期：
// 开 → nav 加 drawer-open + 遮罩加 show + html/body 加 drawer-lock 冻结背景滚动；
// 关 → 全部移除。桌面端遮罩 display:none 永不可见。
// 关闭途径共四条：再点汉堡 / 点遮罩 / ESC / navigate() 切页 —— 全部收敛到 closeMobileDrawer。
function closeMobileDrawer() {
  var nav = document.getElementById("mainNav");
  if (nav) nav.classList.remove("drawer-open");
  var bd = document.getElementById("navBackdrop");
  if (bd) bd.classList.remove("show");
  var btn = document.querySelector(".mobile-menu-btn");
  if (btn) btn.setAttribute("aria-expanded", "false");
  setDrawerScrollLock(false);
}
var DrawerLock = { y: null };
function setDrawerScrollLock(locked) {
  // 类挂 html+body 双保险，配合 CSS（html.drawer-lock 高度收敛一屏 + overflow:hidden）
  // 使 scrollable overflow 归零 —— 无处可滚才是真锁（单靠 overflow 锁不死，见 CSS 注释）。
  // 锁定时记录滚动位置，解锁时还原，避免用户从页面中部关抽屉后被弹回顶部。
  document.documentElement.classList.toggle("drawer-lock", locked);
  document.body.classList.toggle("drawer-lock", locked);
  if (locked) {
    DrawerLock.y = window.scrollY;
  } else if (DrawerLock.y !== null) {
    var y = DrawerLock.y;
    DrawerLock.y = null;
    window.scrollTo(0, y);
  }
}
function toggleMobileMenu() {
  var nav = document.getElementById("mainNav");
  if (!nav) return;
  var bd = document.getElementById("navBackdrop");
  if (!bd) {
    // 遮罩只创建一次并常驻 body（display:none 基样式保证桌面隐藏）
    bd = document.createElement("div");
    bd.className = "nav-backdrop";
    bd.id = "navBackdrop";
    bd.onclick = closeMobileDrawer;
    document.body.appendChild(bd);
  }
  var opening = !nav.classList.contains("drawer-open");
  nav.classList.toggle("drawer-open", opening);
  bd.classList.toggle("show", opening);
  setDrawerScrollLock(opening);
  var btn = document.querySelector(".mobile-menu-btn");
  if (btn) btn.setAttribute("aria-expanded", opening ? "true" : "false");
}

// Render routing
function renderPage(page) {
  const pages = {
    home: renderHome,
    skeleton: renderSkeleton,
    training: renderTraining,
    stems: renderStems,
    schedule: renderSchedule,
    wordlist: renderWordList,
    ai: renderAI,
    scene: renderScene,
    sceneChat: renderSceneChat
  };
  return (pages[page] || renderHome)();
}


// === HOME PAGE ===
// ---- 首页复习提醒（Phase 4.3 候选落地：每日复习是拾遗的核心循环，首页每天第一屏应给出引导）----
// 出现条件：有非掌握收藏 且 今日尚未复习（getWordListReviewStats().todayDone，
// 与拾遗页统计面板同一口径）。全部掌握或今日已复习 → 不打扰。
function homeReviewNudge() {
  var pending = getCollections().filter(function(c) { return c.status !== "mastered"; }).length;
  if (!pending || getWordListReviewStats().todayDone) return "";
  return '<div class="home-review-nudge">' +
    '<span class="home-review-txt">🏷️ 拾遗复习：今日还有 <strong>' + pending + '</strong> 条待复习</span>' +
    '<button class="ai-suggest-btn" onclick="startHomeReview()">🎴 开始复习</button>' +
  '</div>';
}
function startHomeReview() {
  navigate("wordlist");
  startWordListReview();
}
function renderHome() {
  return `
    <section class="hero">
      <h1>🇰🇷 Basic Korean</h1>
      <p>用"最小可行系统"启动韩语学习。<br>先建立骨架，再添加血肉，两周内拥有完整的韩语地图。</p>
      ${homeReviewNudge()}
      <div class="hero-cards">
        <div class="hero-card" onclick="navigate('skeleton')">
          <div class="icon">🏗️</div>
          <h3>7 大筑基规则</h3>
          <p>韩语语法的承重墙——先立起来房子不会倒</p>
        </div>
        <div class="hero-card" onclick="navigate('training')">
          <div class="icon">🃏</div>
          <h3>抽丝训练</h3>
          <p>43 句逐词拆解，学会"看标签"而不是"看单词"</p>
        </div>
        <div class="hero-card" onclick="navigate('stems')">
          <div class="icon">📝</div>
          <h3>核心剥茧</h3>
          <p>84 个最常用词干（动词 + 形容词）</p>
        </div>
        <div class="hero-card" onclick="navigate('ai')">
          <div class="icon">🤖</div>
          <h3>砥砺</h3>
          <p>输入中文，AI 自动翻译并拆解词性、标注筑基规则</p>
        </div>
        <div class="hero-card" onclick="navigate('scene')">
          <div class="icon">🎭</div>
          <h3>临境</h3>
          <p>选择场景，和 AI 角色用韩语对话练习，自动播放发音</p>
        </div>
        <div class="hero-card" onclick="navigate('schedule')">
          <div class="icon">🗓️</div>
          <h3>两周润物表</h3>
          <p>每天 20 分钟，从零到能造简单句子</p>
        </div>
<div class="hero-card" onclick="navigate('wordlist')">
	          <div class="icon">🏷️</div>
	          <h3>拾遗</h3>
	          <p>收藏的词与句，查漏补缺，复习巩固</p>
	        </div>
	      </div>
	    </section>
	    <div style="text-align:center;margin-top:20px;color:var(--text-light);font-size:13px;">
	      <p>💡 建议顺序：筑基 → 抽丝 → 剥茧 → 砥砺 → 临境 → 润物 → 拾遗</p>
      <p style="margin-top:6px;">⌨️ 快捷键：数字键 1-8 快速切换页面（输入框内不触发）· <a href="javascript:void(0)" onclick="toggleShortcutsHelp()" style="color:var(--primary-ink);text-decoration:underline;">查看全部快捷键</a></p>
    </div>
  `;
}

// 骨架规则跳转（从断句/AI 结果点击规则编号直达骨架页并展开）
var pendingRule = null;
function jumpToRule(n) { pendingRule = n; skeletonTab = "rules"; navigate("skeleton"); }

// === SKELETON PAGE ===
var skeletonTab = "rules"; // rules=句的助记, words=词的助记

// 筑基页 = 句的助记（7 大语法规则）+ 词的助记（助词/词尾/疑问词）
function renderSkeleton() {
  var tabBar = '<div class="filter-bar skeleton-tabs">' +
    '<button class="filter-btn' + (skeletonTab === "rules" ? " active" : "") + '" onclick="switchSkeletonTab(\'rules\')">① 句的助记</button>' +
    '<button class="filter-btn' + (skeletonTab === "words" ? " active" : "") + '" onclick="switchSkeletonTab(\'words\')">② 词的助记</button>' +
    '</div>';
  return tabBar + (skeletonTab === "rules" ? renderSkeletonRules() : renderWordMnemonics());
}

function switchSkeletonTab(tab) {
  skeletonTab = tab;
  // Vue 模式下只重绘骨架页组件自己的根节点（.skeleton-page-vue），绝不能覆盖 #mainContent。
  // ⚠️ root 为 null（组件尚未挂载的竞态窗）时严禁兜底写 #mainContent——会连 #vue-root 一起
  // 抹掉（Iteration 021 在 rerenderWordList 实测的事故），改走 refreshCurrentPage() 重建。
  var root = document.querySelector("#mainContent .skeleton-page-vue");
  if (!root) { refreshCurrentPage(); return; }
  root.innerHTML = renderSkeleton();
  retriggerPageEnter();
  initRevealObserver();
}

// 词的助记：助词/词尾/疑问词 表格（与拾遗共用 ref* 行渲染 + 数据源）
function renderWordMnemonics() {
  var particlesHtml = WORD_MNEMONICS.particles.map(function(p) { return refParticleRow(p, "skeleton"); }).join("");
  var endingsHtml = WORD_MNEMONICS.endings.map(function(e) { return refEndingRow(e, "skeleton"); }).join("");
  var qwordsHtml = WORD_MNEMONICS.questionWords.map(function(q) { return refQwordChip(q, "skeleton"); }).join("");
  return '' +
    '<div class="page-title">' +
      '<h2>🏗️ 词的助记</h2>' +
      '<p>词级基础知识：助词 / 词尾 / 疑问词。先记零件，再套句的助记规则。</p>' +
    '</div>' +
    '<div class="tip-banner"><strong>🎯 目标：</strong>认识这些"零件"——看到助词知道角色、看到词尾知道时态语气。与「句的助记」规则 ②③⑤⑦ 对照学习，行尾 ☆ 可收藏到拾遗。</div>' +
    '<div class="card ref-section">' +
      '<div class="card-title">🔴 助词 <span class="badge badge-red">' + WORD_MNEMONICS.particles.length + ' 个</span></div>' +
      '<table class="ref-table"><thead><tr><th>助词</th><th>类型</th><th>含义</th><th>优先级</th><th>例句</th><th></th></tr></thead><tbody>' + particlesHtml + '</tbody></table>' +
    '</div>' +
    '<div class="card ref-section">' +
      '<div class="card-title">🟠 词尾 <span class="badge badge-orange">' + WORD_MNEMONICS.endings.length + ' 个</span></div>' +
      '<table class="ref-table"><thead><tr><th>词尾</th><th>类型</th><th>含义</th><th>优先级</th><th>例句</th><th></th></tr></thead><tbody>' + endingsHtml + '</tbody></table>' +
    '</div>' +
    '<div class="card ref-section">' +
      '<div class="card-title">❓ 疑问词 <span class="badge badge-green">' + WORD_MNEMONICS.questionWords.length + ' 个</span></div>' +
      '<div>' + qwordsHtml + '</div>' +
    '</div>';
}

function renderSkeletonRules() {
  let rulesHtml = RULES.map((rule, idx) => {
    let examplesHtml = rule.examples.map(ex => {
      let breakdownHtml = ex.breakdown.map(b => {
        let cls = getElemClassFromMeaning(b[1]);
        return `<div style="display:inline-flex;align-items:center;gap:2px;margin:3px 0;">
          <span class="elem-tag ${cls}" style="font-size:13px;padding:3px 10px;">${b[0]}</span>
          <span style="font-size:12px;color:var(--text-light);margin:0 6px 0 2px;">→ ${b[1]}</span>
        </div>`;
      }).join(" ");

      // 提取结构流（角色排列）
      let structure = ex.breakdown.map(b => {
        let role = b[1].replace(/\(.*?\)/g, "").trim();
        return role;
      }).join(" → ");

      return `<div style="margin-bottom:14px;background:var(--bg);padding:14px;border-radius:8px;">
        <div style="font-size:20px;font-weight:500;margin-bottom:8px;">${ex.kr}${playBtn(ex.kr, "small")}</div>
        <div style="font-size:13px;display:flex;flex-wrap:wrap;gap:2px;align-items:center;line-height:2;">${breakdownHtml}</div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:12px;color:var(--text-light);">
          📐 结构流：${structure}
        </div>
      </div>`;
    }).join("");

    return `
      <div class="rule-item">
        <button class="rule-header" onclick="toggleRule(${idx})">
          <span class="num">${rule.icon}</span>
          <span style="font-weight:600;">${rule.title}</span>
          <span style="font-size:13px;color:var(--text-light);margin-left:8px;">${rule.summary}</span>
          <span class="arrow">▼</span>
        </button>
        <div class="rule-body" id="ruleBody${idx}">
          <p style="color:var(--text-light);font-size:14px;padding:8px 0;border-bottom:1px solid var(--border);margin-bottom:12px;">${rule.details.replace(/\n/g, "<br>")}</p>
          <div style="font-weight:600;font-size:14px;margin-bottom:8px;">📖 例句拆解</div>
          ${examplesHtml}
          <div style="margin-top:12px;padding:10px 14px;background:var(--accent-light);border-radius:8px;font-size:13px;">
            <span style="font-weight:600;">💡 ${rule.tip}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="page-title">
      <h2>🏗️ 7 大筑基规则</h2>
      <p>韩语语法的承重墙。先建立地图感，细节在练习中自然补齐。</p>
    </div>
    <div class="tip-banner"><strong>🎯 目标：</strong>不是精通，而是知道"有这 7 个东西存在"。每个规则看一遍例句拆解，你就知道韩语的语法地图长什么样了。<br><strong>🔗 联动：</strong>抽丝训练页的每个词都标注了对应的筑基规则编号，可与本页对照学习。</div>
    <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="ai-suggest-btn" onclick="toggleAllRules(true)">📖 展开全部</button>
      <button class="ai-suggest-btn" onclick="toggleAllRules(false)">📕 收起全部</button>
    </div>
    ${renderColorLegend()}
    ${rulesHtml}
  `;
}

function toggleRule(idx) {
  const body = document.getElementById("ruleBody" + idx);
  const header = body.previousElementSibling;
  body.classList.toggle("open");
  header.classList.toggle("open");
}

// 展开或收起所有骨架规则
function toggleAllRules(expand) {
  for (var i = 0; i < RULES.length; i++) {
    var body = document.getElementById("ruleBody" + i);
    if (body) {
      body.classList.toggle("open", expand);
      if (body.previousElementSibling) body.previousElementSibling.classList.toggle("open", expand);
    }
  }
}

// === TRAINING PAGE ===
let trainingFilter = "all";

function renderTraining() {
  let groups = [...new Set(SENTENCES.map(s => s.group))];
  let filterBtns = ['<button class="filter-btn active" data-group="all" onclick="setTrainingFilter(\'all\')">全部</button>']
    .concat(groups.map(g => `<button class="filter-btn" data-group="${g}" onclick="setTrainingFilter('${g}')">${g}</button>`))
    .concat(['<button class="filter-btn" data-group="unmastered" onclick="setTrainingFilter(\'unmastered\')">未掌握</button>'])
    .join("");

  let sentencesHtml = SENTENCES.filter(s => {
    if (trainingFilter === "all") return true;
    if (trainingFilter === "unmastered") return !trainingDone[s.id];
    return s.group === trainingFilter;
  }).sort(function(a, b) {
    // 未掌握优先（已掌握排后）
    var aDone = trainingDone[a.id] ? 1 : 0, bDone = trainingDone[b.id] ? 1 : 0;
    return aDone - bDone;
  }).map(s => {
    let ruleSet = new Set();
    let breakdownHtml = s.breakdown.map(b => {
      let elemCls = getElemClass(b);
      let ruleNum = getRuleTag(b);
      ruleSet.add(ruleNum);
      return `<div class="breakdown-item">
        <strong>${b.part}</strong>
        <span class="elem-tag ${elemCls}" style="font-size:10px;padding:1px 6px;margin-left:4px;">${b.label || b.tag}</span>
        ${ruleBadge(ruleNum)}
        <span class="mean">${b.meaning}</span>
      </div>`;
    }).join("");

    let ruleSummary = [...ruleSet].sort().map(n => ruleBadge(n)).join(" ");
    let tipHtml = s.tip ? `<div class="ai-tip">🔑 ${s.tip}</div>` : "";
    let done = trainingDone[s.id];

    return `
      <div class="sentence-card ${done ? "mastered" : ""}" onclick="toggleBreakdown(this)">
        <div class="sentence-top">
          <div class="sentence-num">#${s.id} · ${s.group}</div>
          ${collectBtn("sentence", s.kr, s.full, "training", "sentence:" + s.id)}
          <button class="master-btn ${done ? "mastered" : ""}" onclick="event.stopPropagation(); toggleMastered(${s.id}, this)" title="标记为已掌握">${done ? "✓ 已掌握" : "○ 标记掌握"}</button>
        </div>
        <div class="kr">${s.kr}${playBtn(s.kr, "small")}</div>
        <div class="breakdown">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">🔍 逐词拆解</div>
          <div class="breakdown-row">${breakdownHtml}</div>
          <div style="margin-top:8px;font-size:14px;color:var(--text-light);">→ ${s.full}</div>
          <div style="margin-top:8px;font-size:12px;color:var(--text-light);">筑基规则：${ruleSummary}</div>
          ${tipHtml}
        </div>
        <div style="font-size:12px;color:var(--text-light);margin-top:4px;">👆 点击展开拆解</div>
      </div>
    `;
  }).join("");

  let doneCount = Object.values(trainingDone).filter(v => v).length;

  return `
    <div class="page-title">
      <h2>🃏 抽丝训练</h2>
      <p>三遍法：① 圈出助词和词尾 ② 说出每个标签的功能 ③ 不看标注猜意思</p>
    </div>
    ${shouldShowTip('training_method') ? '<div class="tip-banner accent" id="tip-training_method"><strong>💡 训练方法：</strong>先自己尝试断句，再点击展开看拆解。每天 3-5 句，两周内完成全部 43 句。<button class="tip-close" onclick="dismissTip(this, \'training_method\')">✕</button></div>' : ''}
    <div style="margin-bottom:16px;padding:14px;background:var(--primary-lighter);border-radius:var(--radius-sm);font-size:14px;">
      <strong>📊 已掌握</strong> <span id="trainingProgress">${doneCount} / ${SENTENCES.length}</span>
    </div>
    ${renderColorLegend()}
    <div class="filter-bar">${filterBtns}</div>
    <div class="practice-bar">
      <button class="ai-submit-btn" onclick="startRandomPractice()">🎲 随机练一句</button>
      <span style="font-size:12px;color:var(--text-light);margin-left:8px;">每天抽几条，先自己断句再点“看拆解”</span>
    </div>
    <div id="randomPractice"></div>
    ${sentencesHtml}
  `;
}

function setTrainingFilter(group) {
  trainingFilter = group;
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.group === group);
  });
  // Vue 模式下只重绘训练页组件自己的根节点（.training-page-vue），
  // 绝不能覆盖 #mainContent —— 那会连同 #vue-root（Vue 挂载点）一起被删除，导致导航全部失效。
  // ⚠️ root 为 null（组件尚未挂载的竞态窗）时严禁兜底写 #mainContent（Iteration 021 同款事故），
  // 改走 refreshCurrentPage() 重建。
  var root = document.querySelector("#mainContent .training-page-vue");
  if (!root) { refreshCurrentPage(); return; }
  root.innerHTML = renderTraining();
  retriggerPageEnter();
  var items = root.querySelectorAll(".sentence-card");
  items.forEach(function(item, i) {
    item.style.animationDelay = Math.min(i * 0.04, 0.4) + "s";
  });
  initRevealObserver();
}

// 标记/取消"已掌握"，持久化并刷新计数（不整页重渲染以保留滚动与展开态）
function toggleMastered(id, btn) {
  trainingDone[id] = !trainingDone[id];
  if (!trainingDone[id]) syncMarkDeleted("korean_training_done", id); // 取消勾选 = 墓碑，防止并集复活
  syncPut("korean_training_done", trainingDone);
  var card = btn.closest(".sentence-card");
  if (card) card.classList.toggle("mastered", trainingDone[id]);
  btn.classList.toggle("mastered", trainingDone[id]);
  btn.textContent = trainingDone[id] ? "✓ 已掌握" : "○ 标记掌握";
  updateTrainingProgress();
  // 处于"未掌握"筛选时，标记掌握后即时隐藏该卡
  if (trainingFilter === "unmastered" && trainingDone[id] && card) card.style.display = "none";
}

function updateTrainingProgress() {
  var el = document.getElementById("trainingProgress");
  if (!el) return;
  var doneCount = Object.values(trainingDone).filter(v => v).length;
  el.textContent = doneCount + " / " + SENTENCES.length;
  // 全部掌握时庆祝
  if (doneCount === SENTENCES.length && doneCount > 0) {
    showToast("🎉🎉🎉 全部掌握！你已经完成了 43 句抽丝训练，太棒了！");
  }
}

// 随机练习卡：韩文 + 可折叠拆解 + 看拆解/换一条/标记掌握
function practiceCardHtml(s) {
  let ruleSet = new Set();
  let breakdownHtml = s.breakdown.map(b => {
    let elemCls = getElemClass(b);
    let ruleNum = getRuleTag(b);
    ruleSet.add(ruleNum);
    return `<div class="breakdown-item">
      <strong>${b.part}</strong>
      <span class="elem-tag ${elemCls}" style="font-size:10px;padding:1px 6px;margin-left:4px;">${b.label || b.tag}</span>
      ${ruleBadge(ruleNum)}
      <span class="mean">${b.meaning}</span>
    </div>`;
  }).join("");
  let ruleSummary = [...ruleSet].sort().map(n => ruleBadge(n)).join(" ");
  let done = trainingDone[s.id];
  return `
    <div class="practice-card">
      <div class="sentence-top">
        <div class="sentence-num">#${s.id} · ${s.group}</div>
        <button class="master-btn ${done ? "mastered" : ""}" onclick="event.stopPropagation(); toggleMastered(${s.id}, this)">${done ? "✓ 已掌握" : "○ 标记掌握"}</button>
      </div>
      <div class="kr">${s.kr}${playBtn(s.kr, "small")}</div>
      <div class="breakdown">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">🔍 逐词拆解</div>
        <div class="breakdown-row">${breakdownHtml}</div>
        <div style="margin-top:8px;font-size:14px;color:var(--text-light);">→ ${s.full}</div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-light);">筑基规则：${ruleSummary}</div>
        ${s.tip ? `<div class="ai-tip">🔑 ${s.tip}</div>` : ""}
      </div>
      <div class="practice-actions">
        <button class="ai-suggest-btn" onclick="this.closest('.practice-card').querySelector('.breakdown').classList.toggle('show')">👀 看拆解</button>
        <button class="ai-submit-btn" onclick="startRandomPractice()">🎲 换一条</button>
      </div>
    </div>`;
}

// 随机抽一句：优先从未掌握里抽，全掌握后从全部抽
function startRandomPractice() {
  var candidates = SENTENCES.filter(s => !trainingDone[s.id]);
  if (candidates.length === 0) candidates = SENTENCES;
  var s = candidates[Math.floor(Math.random() * candidates.length)];
  var box = document.getElementById("randomPractice");
  if (box) box.innerHTML = practiceCardHtml(s);
}

function toggleBreakdown(el) {
  const bd = el.querySelector(".breakdown");
  var wasHidden = !bd.classList.contains("show");
  bd.classList.toggle("show");
  // 展开时自动朗读整句（学习闭环：声音很重要）
  if (wasHidden) {
    var krEl = el.querySelector(".kr");
    if (krEl) { try { speakKorean(krEl.textContent.replace(/🔊/g, "").trim()); } catch (e) {} }
  }
}

// === STEMS PAGE ===
function renderStems() {
  const categories = [
    { id: "verbs", title: "动词词干 (52个)", data: STEMS.verbs },
    { id: "adjectives", title: "形容词词干 (32个)", data: STEMS.adjectives }
  ];

  let catsHtml = categories.map(cat => {
    let filtered = cat.data;
    let itemsHtml = filtered.map(s => {
      let irregBadge = s.irreg ? '<span style="font-size:10px;padding:1px 6px;border-radius:99px;background:#f5edf7;color:#7b3a9e;margin-left:4px;font-weight:600;">' + s.irreg + '</span>' : '';
      return `
      <div class="stem-item">
        <div class="stem">${s.stem}${playBtn(s.stem, "small")}${irregBadge}${collectBtn("word", s.stem, s.meaning + " (" + s.proto + ")", "stems", "stem:" + s.proto)}</div>
        <div class="mean">${s.meaning} <span style="color:var(--border);">|</span> <span style="color:var(--text-light);font-size:12px;">${s.proto}</span></div>
        <div class="example">${s.example}${playBtn(s.example, "small")}</div>
      </div>`;
    }).join("");
    return `
      <div class="stem-category">
        <h3>${cat.title} <span style="font-size:14px;font-weight:400;color:var(--text-light);">(${cat.data.length}个)</span></h3>
        <div class="stem-grid">${itemsHtml}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="page-title">
      <h2>📝 核心剥茧清单</h2>
      <p>词干 + 词尾 = 完整的韩语动词/形容词。先记词干，再套规则。</p>
    </div>
    <div class="tip-banner" style="margin-bottom:16px;font-size:13px;line-height:1.8;"><strong>📌 使用建议</strong><br>• 每天学 10 个词干，2 周学完全部<br>• 不要孤立背——每个词干配 1 个常用搭配一起记<br>• 优先掌握动词——前 50 个动词词干覆盖 80% 日常表达</div>
    <div style="margin-bottom:16px;">
      <input id="stemSearch" class="ai-input" style="width:100%;box-sizing:border-box;" placeholder="🔍 搜索词干 / 含义 / 例句（如：吃、공부、먹다）" oninput="filterStems(this.value)" />
    </div>
    <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="ai-suggest-btn" onclick="playAllStems()">▶ 全部播放</button>
      <span style="font-size:12px;color:var(--text-light);align-self:center;">最有效学发音的方式：先听再跟读</span>
    </div>
    ${catsHtml}
  `;
}

// 词干页实时搜索：按文本过滤词干项，并隐藏无命中分类
function filterStems(q) {
  q = (q || "").trim().toLowerCase();
  document.querySelectorAll("#mainContent .stem-item").forEach(function(el) {
    var hit = !q || el.textContent.toLowerCase().includes(q);
    el.classList.toggle("ref-hidden", !hit);
  });
  document.querySelectorAll("#mainContent .stem-category").forEach(function(cat) {
    var any = cat.querySelector(".stem-item:not(.ref-hidden)");
    cat.style.display = any ? "" : "none";
  });
}

// 词干页顺序播放所有可见项（先读词干，再读例句）
var stemPlayTimer = null;
function playAllStems() {
  if (stemPlayTimer) { clearTimeout(stemPlayTimer); stemPlayTimer = null; }
  var items = document.querySelectorAll("#mainContent .stem-item:not(.ref-hidden)");
  if (!items.length) { showToast("没有可播放的词干"); return; }
  showToast("🔊 正在播放 " + items.length + " 个词干…");
  var idx = 0;
  function playNext() {
    if (idx >= items.length) { showToast("✅ 播放完毕"); stemPlayTimer = null; return; }
    var el = items[idx];
    var stemEl = el.querySelector(".stem");
    var exampleEl = el.querySelector(".example");
    var text = (stemEl ? stemEl.textContent : "") + ". " + (exampleEl ? exampleEl.textContent : "");
    speakKorean(text);
    if (stemEl) stemEl.scrollIntoView({ behavior: "smooth", block: "center" });
    idx++;
    stemPlayTimer = setTimeout(playNext, Math.max(2500, text.length * 200));
  }
  playNext();
}

// === SCHEDULE PAGE ===
var SCHEDULE = [
  { day: 1, title: "通读筑基地图", tasks: ["读 7 大筑基规则", "读筑基·词的助记", "找一段韩语歌词，试着找出 은/는/을/를/에/요"] },
  { day: 2, title: "助词识别训练", tasks: ["复习助词表", "做抽丝训练 #1-5 自我介绍（三遍法）", "学动词词干 1-10 号"] },
  { day: 3, title: "时态识别训练", tasks: ["复习时态词尾", "做抽丝训练 #6-10 日常动作+描述", "学动词词干 11-20 号"] },
  { day: 4, title: "描述与否定", tasks: ["复习规则 ①②③⑥", "做抽丝训练 #11-15 否定句+疑问命令", "学形容词词干 1-10 号"] },
  { day: 5, title: "连接词尾", tasks: ["复习规则 ⑤", "做抽丝训练 #16-20 连接词尾", "学动词词干 21-35 号"] },
  { day: 6, title: "购物点餐场景", tasks: ["做抽丝训练 #21-24 购物点餐", "练习点餐对话：이거 얼마예요? / 주세요", "学动词词干 36-52 号"] },
  { day: 7, title: "第一周总复习", tasks: ["不看标注尝试断句 #1-20", "遮住筑基·词的助记说含义", "自造 3 个简单句子"] },
  { day: 8, title: "问路交通场景", tasks: ["做抽丝训练 #25-28 问路交通", "练习问路对话：어디에 있어요? / 오른쪽으로", "复习形容词词干 1-20 号"] },
  { day: 9, title: "时间计划场景", tasks: ["做抽丝训练 #29-32 时间计划", "练习约会对话：몇 시에 만날까요?", "学形容词词干 21-32 号"] },
  { day: 10, title: "请求感谢场景", tasks: ["做抽丝训练 #33-36 请求感谢", "练习请求对话：주세요 / 좀 부탁해요", "复习全部动词词干"] },
  { day: 11, title: "情感感受场景", tasks: ["做抽丝训练 #37-43 情感感受+新词尾", "练习表达心情：기분이 좋아요 / 피곤해요", "复习全部形容词词干"] },
  { day: 12, title: "连接词尾实战", tasks: ["复习 -고/-서/-지만/-면", "造 5 个复合句", "用 -고 싶어요 造 3 个愿望句"] },
  { day: 13, title: "自由输出", tasks: ["写 100 字韩语日记", "朗读 3 遍，注意语调", "用学过的句型造 10 个新句子"] },
  { day: 14, title: "两周总验收", tasks: ["断句 43 句正确率 70% 以上", "用 -요 体做自我介绍+问答", "掌握 84 个词干 + 43 个核心句型"] }
];

function renderSchedule() {

  let progress = safeParse(localStorage.getItem("korean_progress"), {});

  let cardsHtml = SCHEDULE.map(d => `
    <div class="day-card">
      <div class="day-num">Day ${d.day}</div>
      <div class="day-title">${d.title}</div>
      ${d.tasks.map((t, ti) => {
        let key = d.day + "-" + ti;
        let done = progress[key] ? "done" : "";
        return `<div class="task"><span class="check ${done}" data-key="${key}" onclick="toggleCheck(this)"></span>${t}</div>`;
      }).join("")}
    </div>
  `).join("");

  let doneCount = Object.values(progress).filter(v => v).length;
  let totalCount = SCHEDULE.reduce((sum, d) => sum + d.tasks.length, 0);

  return `
    <div class="page-title">
      <h2>🗓️ 两周润物表</h2>
      <p>每天 20 分钟，不多也不少。关键不是学了多少，而是每天都有。</p>
    </div>
    <div class="tip-banner"><strong>⚡ 核心原则</strong><br>① 20 分钟到就停——超时容易产生厌倦<br>② 不追求完美——Day 7 能断句 30% 就算成功<br>③ 重复比新学重要——前 7 天反复练 30 句 > 学 100 句但不熟<br>④ 声音很重要——所有句子至少读出声 1 遍</div>
    <div style="margin-bottom:16px;padding:14px;background:var(--primary-lighter);border-radius:var(--radius-sm);font-size:14px;">
      <strong>📊 学习进度</strong> ${doneCount} / ${totalCount} (${Math.round(doneCount / totalCount * 100)}%)
      <div style="margin-top:8px;height:8px;background:var(--card-bg);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${doneCount / totalCount * 100}%;background:var(--primary);transition:width 0.3s;"></div>
      </div>
    </div>
    <div class="schedule-grid">${cardsHtml}</div>
  `;
}

function toggleCheck(el) {
  el.classList.toggle("done");
  let key = el.getAttribute("data-key");
  let progress = safeParse(localStorage.getItem("korean_progress"), {});
  progress[key] = el.classList.contains("done");
  if (!progress[key]) syncMarkDeleted("korean_progress", key); // 取消勾选 = 墓碑
  syncPut("korean_progress", progress);
  // 更新进度条
  let schedulePage = document.getElementById("mainContent");
  if (schedulePage.querySelector(".schedule-grid")) {
    let doneCount = Object.values(progress).filter(v => v).length;
    let totalCount = SCHEDULE.reduce((sum, d) => sum + d.tasks.length, 0);
    let progressBar = schedulePage.querySelector("div[style*='height:100%']");
    if (progressBar) progressBar.style.width = (doneCount / totalCount * 100) + "%";
    let progressText = schedulePage.querySelector("strong");
    if (progressText) progressText.nextSibling.textContent = ` ${doneCount} / ${totalCount} (${Math.round(doneCount / totalCount * 100)}%)`;
  }
}

// === AI PAGE ===
var aiLoading = false;
var aiHistory = [];

function renderAI() {
  // 加载历史记录
  aiHistory = safeParse(localStorage.getItem("korean_ai_history"), []);
  // 为历史项补齐稳定 id（旧数据可能缺 id），供删除定位
  aiHistory.forEach(function(h, i) { if (!h.id) h.id = "h" + i + "-" + (h.time || 0); });
  // 渲染后探测 AI 可用性（DOM 就绪后再查，避免拿不到输入框）
  setTimeout(checkAIService, 0);
  // 进入页面即聚焦输入框（聊天类产品标准预期；不强制滚动，避免移动端突兀）
  setTimeout(function() {
    var ai = document.getElementById("aiInput");
    if (ai) ai.focus({ preventScroll: true });
  }, 0);

  return `
    <div class="page-title">
      <h2>🤖 砥砺</h2>
      <p>输入任意中文句子，AI 会自动翻译成韩语并按你的学习体系拆解词性、助词、词尾和筑基规则</p>
    </div>

    <div class="ai-input-section">
      <div class="ai-input-row">
        <input type="text" id="aiInput" class="ai-input" placeholder="输入中文，例如：我想喝咖啡" 
          onkeydown="if(event.key==='Enter') askAI()" />
        <button class="ai-submit-btn" onclick="askAI()" id="aiSubmitBtn">
          <span id="aiBtnText">拆解 ✨</span>
        </button>
      </div>
      <div class="ai-suggestions">
        <span style="font-size:12px;color:var(--text-light);margin-right:8px;">试试：</span>
        <button class="ai-suggest-btn" onclick="askAI('我想喝咖啡')">我想喝咖啡</button>
        <button class="ai-suggest-btn" onclick="askAI('这个多少钱？')">这个多少钱？</button>
        <button class="ai-suggest-btn" onclick="askAI('请问洗手间在哪里？')">请问洗手间在哪里？</button>
        <button class="ai-suggest-btn" onclick="askAI('因为下雨所以没去')">因为下雨所以没去</button>
      </div>
    </div>

    <div id="aiStatus"></div>

    <div id="aiResult"></div>

    <div class="ai-history-section">
      <h3 style="font-size:16px;margin-bottom:12px;color:var(--text-light);">📜 最近练习 <span id="aiHistoryCount">${aiHistory.length}</span> 条</h3>
      <div class="ai-history-tools" style="margin-bottom:8px;">
        <button class="ai-suggest-btn" onclick="exportAIHistory()">📤 导出</button>
        <button class="ai-suggest-btn" onclick="clearAIHistory()">🗑 清空</button>
      </div>
      <div class="ai-history-list">${buildAIHistoryHtml()}</div>
    </div>
  `;
}

// 探测 AI 服务可用性，未配置/未启动则禁用输入并提示
function checkAIService() {
  var input = document.getElementById("aiInput");
  var btn = document.getElementById("aiSubmitBtn");
  var status = document.getElementById("aiStatus");
  var suggestBtns = document.querySelectorAll(".ai-suggest-btn");

  function setUnavailable(msg) {
    aiServiceAvailable = false;
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    suggestBtns.forEach(function(b) { b.disabled = true; });
    if (status) status.innerHTML = '<div class="ai-status-warn">⚠️ ' + escapeHtml(msg) + '</div>';
  }
  function setAvailable() {
    aiServiceAvailable = true;
    if (input) input.disabled = false;
    if (btn) btn.disabled = false;
    suggestBtns.forEach(function(b) { b.disabled = false; });
    if (status) status.innerHTML = "";
  }

  fetch(TTS_BASE + "/ai/status")
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.configured) setAvailable();
      else setUnavailable("AI 未配置：请复制 ai_config.example.json 为 ai_config.json 并填写 API Key 后重启服务");
    })
    .catch(function() {
      setUnavailable("TTS+AI 服务未启动：请先运行 node tts_server.js");
    });
}

// P1-2 轻量探测：只更新 aiServiceAvailable 标志位，供临境等非砥砺页面复用（不触碰砥砺页专属 DOM）
function probeAIService() {
  fetch(TTS_BASE + "/ai/status")
    .then(function(r) { return r.json(); })
    .then(function(d) { aiServiceAvailable = !!(d && d.configured); })
    .catch(function() { aiServiceAvailable = false; });
}

// 构建练习历史列表 HTML（最近 6 条，含删除按钮）
function buildAIHistoryHtml() {
  if (!aiHistory.length) return '<p style="color:var(--text-light);font-size:13px;">还没有练习记录，试试输入一句中文吧 <button class="ai-suggest-btn" style="font-size:12px;padding:2px 10px;margin-left:4px;" onclick="document.getElementById(\'aiInput\').focus()">✍️ 去试试</button></p>';
  return aiHistory.slice(-6).reverse().map(function(h) {
    return '<div class="ai-history-item" onclick="askAI(\'' + attrSafe(h.input || "") + '\')">' +
      '<span class="ai-history-input">' + escapeHtml(h.input || "") + '</span>' +
      '<span class="ai-history-kr">' + escapeHtml(h.kr || "") + '</span>' +
      '<button class="ai-history-del" onclick="event.stopPropagation(); deleteAIHistory(\'' + h.id + '\')" title="删除">✕</button>' +
    '</div>';
  }).join("");
}

function deleteAIHistory(id) {
  aiHistory = aiHistory.filter(function(h) { return h.id !== id; });
  syncMarkDeleted("korean_ai_history", id); // 墓碑
  syncPut("korean_ai_history", aiHistory);
  var list = document.querySelector(".ai-history-list");
  if (list) list.innerHTML = buildAIHistoryHtml();
  var cnt = document.getElementById("aiHistoryCount");
  if (cnt) cnt.textContent = aiHistory.length;
}

function clearAIHistory() {
  if (!aiHistory.length) { showToast("练习历史已为空"); return; }
  aiHistory = [];
  syncClearBlob("korean_ai_history"); // 整体清空墓碑
  syncPut("korean_ai_history", aiHistory);
  var list = document.querySelector(".ai-history-list");
  if (list) list.innerHTML = buildAIHistoryHtml();
  var cnt = document.getElementById("aiHistoryCount");
  if (cnt) cnt.textContent = 0;
  showToast("已清空练习历史");
}

function exportAIHistory() {
  if (!aiHistory.length) { showToast("没有可导出的练习记录"); return; }
  var lines = ["韩语练句历史导出", "导出时间：" + new Date().toLocaleString(), ""];
  aiHistory.slice().reverse().forEach(function(h) {
    lines.push("中文：" + (h.input || "") + "\n韩语：" + (h.kr || "") + (h.full ? "  （" + h.full + "）" : ""));
  });
  var blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "练句历史_" + Date.now() + ".txt";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast("已导出练习历史");
}

function askAI(presetText) {
  if (aiLoading) return;
  if (aiServiceAvailable === false) {
    showToast("AI 服务暂不可用，请按页面提示先完成配置");
    return;
  }

  var input = presetText || document.getElementById("aiInput").value.trim();
  if (!input) {
    showToast("请输入中文句子");
    return;
  }

  aiLoading = true;
  var btn = document.getElementById("aiSubmitBtn");
  var btnText = document.getElementById("aiBtnText");
  var resultDiv = document.getElementById("aiResult");

  // 更新按钮状态
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = "拆解中… ⏳";
  if (resultDiv) {
    resultDiv.innerHTML = `
      <div class="ai-loading">
        <div class="ai-loading-spinner"></div>
        <p>AI 正在拆解「${input}」...</p>
      </div>
    `;
  }

    fetch(TTS_BASE + "/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: input })
  })
  .then(function(resp) { return resp.json(); })
  .then(function(data) {
    if (data.error) throw new Error(data.error);
    aiLoading = false;
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "拆解 ✨";

    // 保存到历史（带稳定 id，供删除定位）
    aiHistory.push({ id: "h" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), input: input, kr: data.kr, full: data.full, data: data, time: Date.now() });
    if (aiHistory.length > 30) aiHistory.shift();
    syncPut("korean_ai_history", aiHistory);

    // 渲染结果
    renderAIResult(data, resultDiv);

    // 自动朗读整句（学习闭环：项目原则强调"声音很重要"）
    setTimeout(function() { try { speakKorean(data.kr); } catch (e) {} }, 350);

    // 刷新历史列表
    var histSection = document.querySelector(".ai-history-list");
    if (histSection) {
      histSection.innerHTML = buildAIHistoryHtml();
      var c = document.getElementById("aiHistoryCount");
      if (c) c.textContent = aiHistory.length;
    }

    // 清空输入框
    if (!presetText && document.getElementById("aiInput")) {
      document.getElementById("aiInput").value = "";
    }
  })
  .catch(function(err) {
    aiLoading = false;
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "拆解 ✨";
    if (resultDiv) {
      resultDiv.innerHTML = `
        <div class="ai-error">
          <div style="font-size:36px;margin-bottom:8px;">😢</div>
          <p style="font-weight:600;margin-bottom:4px;">AI 拆解失败</p>
          <p style="font-size:13px;color:var(--text-light);">${err.message}</p>
          <p style="font-size:12px;color:var(--text-light);margin-top:8px;">请确认：
            <br>① TTS+AI 服务已启动（node tts_server.js）
            <br>② ai_config.json 中已填写正确的 API Key
          </p>
        </div>
      `;
    }
  });
}

function renderAIResult(data, container) {
  if (!container) container = document.getElementById("aiResult");

  // 主句拆解
  var ruleSet = new Set();
  if (data.rules) data.rules.forEach(function(r) { ruleSet.add(r); });

  var breakdownHtml = data.breakdown.map(function(b) {
    var elemCls = getElemClass(b);
    var ruleNum = getRuleTag(b);
    ruleSet.add(ruleNum);
    return '<div class="breakdown-item">' +
      '<strong>' + escapeHtml(b.part) + '</strong>' +
      '<span class="elem-tag ' + elemCls + '" style="font-size:10px;padding:1px 6px;margin-left:4px;">' + escapeHtml(b.label || b.tag) + '</span>' +
      ruleBadge(ruleNum) +
      '<span class="mean">' + escapeHtml(b.meaning) + '</span>' +
    '</div>';
  }).join("");

  var ruleSummary = Array.from(ruleSet).sort().map(function(n) { return ruleBadge(n); }).join(" ");
  var tipHtml = data.tip ? '<div class="ai-tip">🔑 ' + escapeHtml(data.tip) + '</div>' : "";

  // 拓展例句
  var examplesHtml = "";
  if (data.examples && data.examples.length > 0) {
    examplesHtml = '<div class="ai-examples">' +
      '<div class="ai-examples-title">📚 拓展例句</div>' +
      data.examples.map(function(ex, i) {
        var exBreakdown = ex.breakdown.map(function(b) {
          var cls = getElemClass(b);
          var rn = getRuleTag(b);
          return '<div class="breakdown-item">' +
            '<strong>' + escapeHtml(b.part) + '</strong>' +
            '<span class="elem-tag ' + cls + '" style="font-size:10px;padding:1px 6px;margin-left:4px;">' + escapeHtml(b.label || b.tag) + '</span>' +
            ruleBadge(rn) +
            '<span class="mean">' + escapeHtml(b.meaning) + '</span>' +
          '</div>';
        }).join("");
        return '<div class="ai-example-card">' +
          '<div class="ai-example-kr">' + escapeHtml(ex.kr) + playBtn(ex.kr, "small") + '</div>' +
          '<div class="breakdown-row">' + exBreakdown + '</div>' +
          '<div class="ai-example-full">→ ' + escapeHtml(ex.full) + '</div>' +
        '</div>';
      }).join("") +
    '</div>';
  }

  container.innerHTML = `
    <div class="ai-result-card">
      <div class="ai-result-header">
        <span class="ai-result-label">🤖 AI 拆解结果</span>
      </div>
      <div class="sentence-card ai-result-sentence">
        <div class="ai-result-kr">
          ${escapeHtml(data.kr)}${playBtn(data.kr, "small")}${collectBtn("sentence", data.kr, data.full, "ai", "ai:" + (data.kr || "").slice(0, 20))}<button class="korean-copy-btn" onclick="event.stopPropagation(); navigator.clipboard.writeText('${attrSafe(data.kr)}').then(function(){showToast('已复制韩语句子')}).catch(function(){showToast('复制失败，请手动选中')})" title="复制韩语句子">📋</button>
        </div>
        <div class="breakdown show ai-result-breakdown">
          <div class="breakdown-label">🔍 逐词拆解</div>
          <div class="breakdown-row">${breakdownHtml}</div>
          <div class="ai-result-full">→ ${escapeHtml(data.full)}</div>
          <div class="ai-result-rules">筑基规则：${ruleSummary}</div>
          ${tipHtml}
        </div>
      </div>
      ${examplesHtml}
    </div>
  `;

  // 触发入场动效
  var card = container.querySelector(".ai-result-card");
  if (card) {
    card.style.opacity = "0";
    card.style.transform = "translateY(12px)";
    setTimeout(function() {
      card.style.transition = "opacity 0.4s var(--ease), transform 0.4s var(--ease)";
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    }, 10);
  }
}

// ============================================
// === AI SCENE PAGE (情景对话) ===
// ============================================

// 预设场景
var SCENE_PRESETS = [
  {
    id: "preset-restaurant",
    icon: "🍽️",
    title: "餐厅点餐",
    desc: "你在首尔一家餐厅，服务员过来帮你点餐",
    prompt: "场景：你在首尔一家餐厅。你扮演服务员，用户是顾客。请先主动向用户打招呼并介绍菜单，然后引导用户点餐。对话要自然，包含推荐菜品、询问口味等。"
  },
  {
    id: "preset-shopping",
    icon: "🛍️",
    title: "购物砍价",
    desc: "你在明洞逛街，想买衣服但觉得有点贵",
    prompt: "场景：用户在明洞逛街买衣服，你扮演服装店店员。用户可能觉得价格贵，你可以介绍商品优点、给折扣等。请先主动向用户打招呼。"
  },
  {
    id: "preset-taxi",
    icon: "🚕",
    title: "打车出行",
    desc: "你需要打车去一个地方，和司机沟通路线",
    prompt: "场景：用户在韩国打车，你扮演出租车司机。用户会告诉你目的地，你问路线、聊天等。请先主动问用户要去哪里。"
  },
  {
    id: "preset-intro",
    icon: "👋",
    title: "自我介绍",
    desc: "你刚认识一个韩国朋友，互相做自我介绍",
    prompt: "场景：用户刚认识一个韩国朋友（你扮演这个朋友）。你们互相做自我介绍——问名字、职业、兴趣等。请先主动向用户打招呼并自我介绍。"
  },
  {
    id: "preset-directions",
    icon: "🗺️",
    title: "问路指引",
    desc: "你迷路了，需要问路人怎么去某个地方",
    prompt: "场景：用户在韩国迷路了，你扮演路人。用户会问你某个地方怎么走，你给方向指引（左转、右转、直走等）。请先主动问用户需要什么帮助。"
  },
  {
    id: "preset-cafe",
    icon: "☕",
    title: "咖啡店闲聊",
    desc: "在咖啡店和朋友轻松聊天",
    prompt: "场景：用户和你是朋友，在咖啡店喝咖啡聊天。你扮演韩国朋友，聊聊最近的生活、工作、兴趣等轻松话题。请先主动问用户最近怎么样。"
  }
];

// 当前对话状态
var sceneChatState = {
  active: false,
  reviewing: false, // 结束对话后进入复习模式（Vue 组件据此渲染复习页）
  sceneTitle: "",
  scenePrompt: "",
  messages: [],     // {role: 'user'|'assistant', kr, zh, breakdown}
  loading: false,
  muted: false,
  keySet: new Set() // 复习时标记的重点句索引
};

function renderScene() {
  // 加载自定义场景
  var customScenes = safeParse(localStorage.getItem("korean_custom_scenes"), []);
  // P1-2：进入临境页即探测 AI 可用性（用于「开始对话」前置引导黄条）
  setTimeout(probeAIService, 0);

  var presetHtml = SCENE_PRESETS.map(function(s) {
    return '<div class="scene-card" onclick="startSceneChat(\'' + s.id + '\', \'' + attrSafe(s.title) + '\', \'' + attrSafe(s.prompt) + '\')">' +
      '<div class="scene-icon">' + s.icon + '</div>' +
      '<div class="scene-info">' +
        '<div class="scene-title">' + s.title + '</div>' +
        '<div class="scene-desc">' + s.desc + '</div>' +
      '</div>' +
      '<div class="scene-go">▶</div>' +
    '</div>';
  }).join("");

  var customHtml = "";
  if (customScenes.length > 0) {
    customHtml = customScenes.map(function(s, i) {
      return '<div class="scene-card scene-card-custom" onclick="startSceneChat(\'custom-' + i + '\', \'' + attrSafe(s.title) + '\', \'' + attrSafe(s.prompt) + '\')">' +
        '<div class="scene-icon">' + (s.icon || '🎯') + '</div>' +
        '<div class="scene-info">' +
          '<div class="scene-title">' + s.title + '</div>' +
          '<div class="scene-desc">' + (s.desc || s.prompt.substring(0, 30)) + '</div>' +
        '</div>' +
        '<button class="scene-delete" onclick="event.stopPropagation(); deleteCustomScene(' + i + ')">✕</button>' +
        '<div class="scene-go">▶</div>' +
      '</div>';
    }).join("");
  }

  return '' +
    '<div class="page-title">' +
      '<h2>🎭 临境</h2>' +
      '<p>选择一个场景，AI 会扮演韩国角色和你对话。支持中文回答——AI 会理解并继续韩语对话。</p>' +
    '</div>' +
    '<div class="scene-tips">' +
      '<strong>💡 使用方法</strong><br>' +
      '① 点击场景卡片开始对话 &nbsp; ② AI 先发消息并自动播放发音 &nbsp; ③ 你可以用中文或韩文回答 &nbsp; ④ 点击「拆解」查看词性标注 &nbsp; ⑤ 结束后可复习全部对话' +
    '</div>' +
    '<div class="scene-section">' +
      '<h3>📋 预设场景</h3>' +
      '<div class="scene-grid">' + presetHtml + '</div>' +
    '</div>' +
    '<div class="scene-section">' +
      '<h3>🎯 我的场景</h3>' +
      (customHtml ? '<div class="scene-grid">' + customHtml + '</div>' : '<p class="scene-empty">还没有自定义场景，在下方创建一个吧<br><button class="ai-suggest-btn" style="margin-top:8px;" onclick="document.getElementById(\'sceneTitleInput\').focus()">✍️ 去创建</button></p>') +
    '</div>' +
    '<div class="scene-create-card">' +
      '<h3>➕ 创建新场景</h3>' +
      '<input type="text" id="sceneTitleInput" class="ai-input" placeholder="场景名称，例如：医院就诊" style="margin-bottom:10px;" />' +
      '<textarea id="scenePromptInput" class="ai-input scene-textarea" placeholder="场景描述，例如：你在韩国医院看病，需要向医生描述症状。医生会问你哪里不舒服、多久了等。"></textarea>' +
      '<button class="ai-submit-btn" onclick="saveCustomScene()" style="margin-top:10px;">保存场景</button>' +
    '</div>';
}

function saveCustomScene() {
  var title = document.getElementById("sceneTitleInput").value.trim();
  var prompt = document.getElementById("scenePromptInput").value.trim();
  if (!title) { showToast("请输入场景名称"); return; }
  if (!prompt) { showToast("请输入场景描述"); return; }

  var custom = safeParse(localStorage.getItem("korean_custom_scenes"), []);
  // Phase 3：记录级同步——本地先写（离线缓存），已登录则创建云端场景并回写 id
  var item = { title: title, prompt: prompt, icon: "🎯", desc: prompt.substring(0, 40) + "..." };
  custom.push(item);
  localStorage.setItem("korean_custom_scenes", JSON.stringify(custom));
  syncSceneCreate(item);
  showToast("场景已保存！");
  refreshCurrentPage();
}

function deleteCustomScene(idx) {
  var custom = safeParse(localStorage.getItem("korean_custom_scenes"), []);
  var removed = custom[idx];
  custom.splice(idx, 1);
  localStorage.setItem("korean_custom_scenes", JSON.stringify(custom));
  // Phase 3：已登录则删除云端场景（有服务端 id 才能命中；无 id 的旧本地条目仅删本地）
  if (removed && removed.id) syncSceneDelete(removed.id);
  showToast("已删除");
  refreshCurrentPage();
}

// === 对话界面 ===
function startSceneChat(id, title, prompt) {
  sceneChatState.active = true;
  sceneChatState.reviewing = false;
  sceneChatState.sceneTitle = title;
  sceneChatState.scenePrompt = prompt;
  sceneChatState.messages = [];
  sceneChatState.loading = false;
  sceneChatState.muted = false;
  sceneChatState.keySet = new Set();
  navigate("sceneChat");
}

// AI 发起第一条消息
function startFirstMessage() {
  if (sceneChatState.loading) return;
  if (aiServiceAvailable === false) { showToast("🤖 AI 暂未连接，请先配置 AI 服务"); return; }
  sceneChatState.loading = true;
  refreshChatUI();

  // 发送一条空 user 消息触发 AI 开口
  var apiMessages = [{ role: "user", content: "（请开始对话）" }];

  fetch(TTS_BASE + "/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene: sceneChatState.scenePrompt, messages: apiMessages })
  })
  .then(function(resp) { return resp.json(); })
  .then(function(data) {
    if (data.error) throw new Error(data.error);
    sceneChatState.loading = false;
    sceneChatState.messages.push({
      role: "assistant",
      kr: data.kr,
      zh: data.zh,
      breakdown: data.breakdown || []
    });
    refreshChatUI();
    scrollChatToBottom();
    if (!sceneChatState.muted && data.kr) {
      setTimeout(function() { speakKorean(data.kr); }, 300);
    }
  })
  .catch(function(err) {
    sceneChatState.loading = false;
    sceneChatState.messages.push({
      role: "assistant",
      kr: "죄송해요, 오류가 났어요.",
      zh: "抱歉，出错了：" + err.message,
      breakdown: []
    });
    refreshChatUI();
    scrollChatToBottom();
  });
}

function renderSceneChat() {
  if (!sceneChatState.active) {
    return '<div class="page-title"><h2>🎭 临境</h2><p>请先选择一个场景</p></div>';
  }

  var msgsHtml = sceneChatState.messages.map(function(m, i) {
    if (m.role === "user") {
      return '<div class="chat-msg chat-msg-user">' +
        '<div class="chat-bubble chat-bubble-user">' +
          '<div class="chat-text">' + escapeHtml(m.content) + '</div>' +
        '</div>' +
      '</div>';
    }
    // assistant
    var breakdownHtml = "";
    if (m.breakdown && m.breakdown.length > 0) {
      breakdownHtml = m.breakdown.map(function(b) {
        var cls = getElemClass(b);
        var ruleNum = getRuleTag(b);
        return '<div class="breakdown-item">' +
          '<strong>' + escapeHtml(b.part || '') + '</strong>' +
          '<span class="elem-tag ' + cls + '" style="font-size:10px;padding:1px 6px;margin-left:4px;">' + escapeHtml(b.label || b.tag || '') + '</span>' +
          ruleBadge(ruleNum) +
          '<span class="mean">' + escapeHtml(b.meaning || '') + '</span>' +
        '</div>';
      }).join("");
    }
    return '<div class="chat-msg chat-msg-ai">' +
      '<div class="chat-avatar">🤖</div>' +
      '<div class="chat-content">' +
        '<div class="chat-bubble chat-bubble-ai">' +
          '<div class="chat-kr">' + escapeHtml(m.kr || '') + playBtn(m.kr || '', "small") + collectBtn("sentence", m.kr || '', m.zh || '', "scene", "scene:" + sceneChatState.sceneTitle) + '</div>' +
          '<div class="chat-zh">' + escapeHtml(m.zh || '') + '</div>' +
          (breakdownHtml ? '<button class="chat-toggle-btn" onclick="toggleChatBreakdown(' + i + ')">📖 拆解</button>' : '') +
        '</div>' +
        (breakdownHtml ? '<div class="chat-breakdown" id="chatBd' + i + '" style="display:none;"><div class="breakdown-row">' + breakdownHtml + '</div></div>' : '') +
      '</div>' +
    '</div>';
  }).join("");

  var loadingHtml = sceneChatState.loading ?
    '<div class="chat-msg chat-msg-ai">' +
      '<div class="chat-avatar">🤖</div>' +
      '<div class="chat-bubble chat-bubble-ai chat-loading">' +
        '<div class="chat-typing"><span></span><span></span><span></span></div>' +
      '</div>' +
    '</div>' : '';

  // P1-2：AI 不可用时在输入区上方显示常驻黄条并禁用发送
  var aiOffline = aiServiceAvailable === false;
  var aiWarnHtml = aiOffline
    ? '<div class="ai-status-warn" style="margin:0 0 10px;">🤖 AI 暂未连接，可先创建场景 / 查看存档</div>'
    : '';

  return '' +
    '<div class="chat-header">' +
      '<button class="chat-back-btn" onclick="exitSceneChat()">← 返回</button>' +
      '<div class="chat-header-title">💬 ' + escapeHtml(sceneChatState.sceneTitle) + '</div>' +
      '<button class="chat-end-btn" onclick="finishSceneChat()">结束</button>' +
    '</div>' +
    '<div class="chat-container" id="chatContainer">' +
      (sceneChatState.messages.length === 0 && !sceneChatState.loading ?
        '<div class="chat-start-overlay">' +
          '<div class="chat-start-icon">💬</div>' +
          '<p>' + (aiOffline ? '🤖 AI 暂未连接，暂时无法开始对话。可先返回创建场景。' : '准备好了吗？点击开始，AI 会先向你说话') + '</p>' +
          (aiOffline ? '' : '<button class="ai-submit-btn chat-start-btn" onclick="startFirstMessage()">🚀 开始对话</button>') +
        '</div>' : '') +
      (sceneChatState.messages.length > 0 ? msgsHtml : '') +
      loadingHtml +
    '</div>' +
    aiWarnHtml +
    '<div class="chat-input-bar">' +
      '<button class="chat-mute-btn" id="muteBtn" onclick="toggleSceneMute()" title="静音/取消静音">' + (sceneChatState.muted ? '🔇' : '🔊') + '</button>' +
      '<input type="text" id="chatInput" class="ai-input" placeholder="输入中文或韩文回答…"' + (aiOffline ? ' disabled' : '') + ' onkeydown="if(event.key===\'Enter\') sendChatMessage()" />' +
      '<button class="ai-submit-btn" onclick="sendChatMessage()" id="chatSendBtn"' + (aiOffline ? ' disabled' : '') + '>发送</button>' +
    '</div>';
}

function toggleChatBreakdown(i) {
  var el = document.getElementById("chatBd" + i);
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
}

function toggleSceneMute() {
  sceneChatState.muted = !sceneChatState.muted;
  var btn = document.getElementById("muteBtn");
  if (btn) btn.textContent = sceneChatState.muted ? "🔇" : "🔊";
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// 把文本安全嵌入 HTML 属性内的 JS 单引号字符串（onclick 等）:
// 双引号转 HTML 实体（避免截断属性），单引号/反斜杠/换行转义或清除，防止注入
function attrSafe(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, " ");
}

// 发送用户消息 → 获取 AI 回复
function sendChatMessage() {
  if (sceneChatState.loading) return;

  var input = document.getElementById("chatInput");
  var text = input ? input.value.trim() : "";
  if (!text) return;

  // 添加用户消息
  sceneChatState.messages.push({ role: "user", content: text });
  input.value = "";

  // 渲染
  sceneChatState.loading = true;
  refreshChatUI();
  scrollChatToBottom();

  // 构建 API 消息（只发 content 给 AI，不发送 kr/zh/breakdown）
  var apiMessages = sceneChatState.messages.map(function(m) {
    if (m.role === "user") return { role: "user", content: m.content };
    return { role: "assistant", content: m.kr };
  });

  fetch(TTS_BASE + "/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene: sceneChatState.scenePrompt, messages: apiMessages })
  })
  .then(function(resp) { return resp.json(); })
  .then(function(data) {
    if (data.error) throw new Error(data.error);
    sceneChatState.loading = false;
    sceneChatState.messages.push({
      role: "assistant",
      kr: data.kr,
      zh: data.zh,
      breakdown: data.breakdown || []
    });
    refreshChatUI();
    scrollChatToBottom();
    // 自动播放 TTS
    if (!sceneChatState.muted && data.kr) {
      setTimeout(function() { speakKorean(data.kr); }, 300);
    }
  })
  .catch(function(err) {
    sceneChatState.loading = false;
    sceneChatState.messages.push({
      role: "assistant",
      kr: "죄송해요, 오류가 났어요.",
      zh: "抱歉，出错了：" + err.message,
      breakdown: []
    });
    refreshChatUI();
    scrollChatToBottom();
  });
}

function refreshChatUI() {
  // Vue 激活时：递增 chatTick 使 :key 变化 → 组件销毁重建 → computed 重新求值 → 渲染最新消息。
  // ⚠️ 不能 navigate("sceneChat")：已在 sceneChat 页时 currentPage 值不变，Vue 不会重渲染（已实测复现）。
  // ⚠️ 不用手工 innerHTML：sceneChatState 是非响应式全局，Vue 的 v-html 绑定仍持有旧缓存串，
  //    组件因其他原因重渲染时会用旧缓存覆盖新内容。tick 重建让 Vue 全程掌控渲染，无此风险。
  var hadFocus = document.activeElement && document.activeElement.id === "chatInput";
  if (window.vueApp && typeof window.vueApp.refreshSceneChat === 'function') {
    window.vueApp.refreshSceneChat();
    // Vue 重建是异步的（nextTick），且输入框是新建节点，恢复焦点便于连续输入
    if (hadFocus) {
      setTimeout(function() {
        var inp = document.getElementById("chatInput");
        if (inp) inp.focus();
      }, 50);
    }
    return;
  }
  // 传统模式：直接替换内容
  var main = document.getElementById("mainContent");
  main.innerHTML = renderSceneChat();
  retriggerPageEnter();
  if (hadFocus) {
    var inp = document.getElementById("chatInput");
    if (inp) inp.focus();
  }
}

function scrollChatToBottom() {
  // Vue 模式下重绘是异步的（nextTick），延迟执行确保新 DOM 已挂载
  setTimeout(function() {
    var container = document.getElementById("chatContainer");
    if (container) container.scrollTop = container.scrollHeight;
  }, 60);
}

function exitSceneChat() {
  sceneChatState.active = false;
  sceneChatState.reviewing = false;
  sceneChatState.messages = [];
  navigate("scene");
}

// 结束对话 → 复习模式
function finishSceneChat() {
  if (sceneChatState.messages.length === 0) {
    exitSceneChat();
    return;
  }

  // 保存对话记录（本地镜像 + Phase 3 云端存档到记录级 scene_messages）
  var history = safeParse(localStorage.getItem("korean_scene_history"), []);
  var historyEntry = {
    title: sceneChatState.sceneTitle,
    time: Date.now(),
    messages: sceneChatState.messages
  };
  history.push(historyEntry);
  if (history.length > 20) history.shift();
  localStorage.setItem("korean_scene_history", JSON.stringify(history));
  syncSceneArchive(sceneChatState.sceneTitle, sceneChatState.messages, historyEntry);

  // 进入复习模式（Vue 用 tick 重建渲染，避免覆盖 #vue-root 导致导航失效）
  sceneChatState.reviewing = true;
  refreshSceneReviewUI();
}

function renderSceneReview() {
  var msgsHtml = sceneChatState.messages.map(function(m, i) {
    if (m.role === "user") {
      return '<div class="review-msg review-msg-user">' +
        '<div class="review-role">🧑 我</div>' +
        '<div class="review-text">' + escapeHtml(m.content) + '</div>' +
      '</div>';
    }
    var keyed = sceneChatState.keySet.has(i);
    return '<div class="review-msg review-msg-ai' + (keyed ? ' keyed' : '') + '" data-idx="' + i + '">' +
      '<div class="review-role">🤖 AI <button class="key-btn ' + (keyed ? 'on' : '') + '" onclick="toggleSceneKey(' + i + ', this)" title="标记为重点句">⭐</button></div>' +
      '<div class="review-kr">' + escapeHtml(m.kr || '') + playBtn(m.kr || '', "small") + '</div>' +
      '<div class="review-zh">' + escapeHtml(m.zh || '') + '</div>' +
    '</div>';
  }).join("");

  // 纯渲染函数：只返回 HTML，由调用方决定写入方式（Vue tick 重建 / 传统 innerHTML）
  return '' +
    '<div class="page-title">' +
      '<h2>📖 对话复习</h2>' +
      '<p>场景：' + escapeHtml(sceneChatState.sceneTitle) + ' &nbsp;|&nbsp; 共 ' + sceneChatState.messages.length + ' 条 &nbsp;|&nbsp; 重点句 <span id="sceneKeyCount">' + sceneChatState.keySet.size + '</span></p>' +
    '</div>' +
    '<div class="review-container">' + msgsHtml + '</div>' +
    '<div class="review-actions">' +
      '<button class="ai-submit-btn" onclick="exitSceneChat()">返回场景列表</button>' +
      '<button class="ai-suggest-btn" onclick="replayAllSceneAudio()" style="padding:14px 28px;">🔊 顺序播放全部</button>' +
      '<button class="ai-suggest-btn" onclick="replayKeySceneAudio()">🔁 重练重点句</button>' +
      '<button class="ai-suggest-btn" onclick="exportSceneTxt()">📤 导出</button>' +
    '</div>';
}

// 渲染复习界面：Vue 模式递增 chatTick 强制组件重建（页面停留在 sceneChat，key 变化触发重渲染），
// 传统模式直接 innerHTML。⚠️ 绝不能直接写 #mainContent —— 会连同 #vue-root（Vue 挂载点）删除，导航全部失效。
function refreshSceneReviewUI() {
  if (window.vueApp && typeof window.vueApp.refreshSceneChat === 'function') {
    window.vueApp.refreshSceneChat();
    return;
  }
  // 传统模式：直接替换内容
  var main = document.getElementById("mainContent");
  main.innerHTML = renderSceneReview();
  retriggerPageEnter();
}

// 标记/取消重点句
function toggleSceneKey(i, btn) {
  if (sceneChatState.keySet.has(i)) sceneChatState.keySet.delete(i);
  else sceneChatState.keySet.add(i);
  var on = sceneChatState.keySet.has(i);
  btn.classList.toggle("on", on);
  var card = btn.closest(".review-msg-ai");
  if (card) card.classList.toggle("keyed", on);
  var cnt = document.getElementById("sceneKeyCount");
  if (cnt) cnt.textContent = sceneChatState.keySet.size;
}

var replayQueue = [];
var replayIndex = 0;
function replayAllSceneAudio() {
  replayQueue = sceneChatState.messages.map(function(m, i) { return { kr: m.kr, idx: i }; })
    .filter(function(x) { return x.kr; });
  replayIndex = 0;
  playNextReplay();
}

// 仅重练标记为重点句的 AI 回复（影子跟读）
function replayKeySceneAudio() {
  if (sceneChatState.keySet.size === 0) { showToast("请先点 ⭐ 标记重点句"); return; }
  replayQueue = sceneChatState.messages.map(function(m, i) { return { kr: m.kr, idx: i }; })
    .filter(function(x) { return x.kr && sceneChatState.keySet.has(x.idx); });
  replayIndex = 0;
  playNextReplay();
}

function playNextReplay() {
  if (replayIndex >= replayQueue.length) {
    showToast("播放完毕");
    return;
  }
  var item = replayQueue[replayIndex];
  // 按消息原始索引精确定位（修正此前用 replayIndex 直接索引 DOM 的错位隐患）
  var el = document.querySelector('.review-msg-ai[data-idx="' + item.idx + '"] .review-kr');
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.background = "var(--primary-lighter)";
    setTimeout(function() { el.style.background = ""; }, 2000);
  }
  speakKorean(item.kr);
  replayIndex++;
  var duration = Math.max(2000, item.kr.length * 300);
  setTimeout(playNextReplay, duration);
}

// 导出对话记录为 txt
function exportSceneTxt() {
  if (!sceneChatState.messages.length) { showToast("没有可导出的对话"); return; }
  var lines = ["场景：" + sceneChatState.sceneTitle, "导出时间：" + new Date().toLocaleString(), ""];
  sceneChatState.messages.forEach(function(m) {
    var who = m.role === "user" ? "我" : "AI";
    var line = who + "：" + (m.kr || m.content || "");
    if (m.zh) line += "  （" + m.zh + "）";
    lines.push(line);
  });
  var blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "场景对话_" + (sceneChatState.sceneTitle || "scene") + "_" + Date.now() + ".txt";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast("已导出对话记录");
}

// ---- 快捷键帮助面板（B6）：数字键导航只写在 hover title 里，无发现入口 ----
// 顶栏按标杆约束不得加第 5 个按钮（375px 已到极限），故用 ? 键呼出。
// 样式全部复用统计弹窗三件套（stats-overlay/stats-modal/stats-row），零新增 CSS。
// 注意必须是全局函数：弹层关闭走内联 onclick，只解析 window 上的名字。
var SHORTCUT_ROWS = [
  ["1 – 8", "切换页面：归藏 / 筑基 / 抽丝 / 剥茧 / 砥砺 / 临境 / 润物 / 拾遗"],
  ["0", "学习统计仪表盘"],
  ["空格 / ← →", "拾遗复习中：翻面 / 切卡"],
  ["?", "打开 / 关闭本面板"],
  ["Esc", "关闭弹层与移动端抽屉"]
];
function toggleShortcutsHelp() {
  var old = document.getElementById("shortcutsOverlay");
  if (old) { old.remove(); restoreModalFocus(); return; }
  var overlay = document.createElement("div");
  overlay.className = "stats-overlay";
  overlay.id = "shortcutsOverlay";
  overlay.onclick = function(e) { if (e.target === overlay) toggleShortcutsHelp(); };
  overlay.innerHTML = '<div class="stats-modal">' +
    '<button class="stats-close" onclick="toggleShortcutsHelp()" aria-label="关闭快捷键面板">✕</button>' +
    '<h2>⌨️ 快捷键</h2>' +
    SHORTCUT_ROWS.map(function(r) {
      return '<div class="stats-row"><span>' + r[1] + '</span><span class="stat-value">' + r[0] + '</span></div>';
    }).join("") +
  '</div>';
  document.body.appendChild(overlay);
  focusModal(overlay);
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  // 全局未捕获错误处理（防止空白页，显示友好提示）
  window.addEventListener("error", function(e) {
    // 资源加载错误（favicon/图片/字体 404）不影响功能，不弹 toast
    if (e.target && e.target !== window) {
      return;
    }
    // 真正的 JS 异常才提示
    showToast("⚠️ 发生了意外错误，但页面仍可继续使用。");
    console.error(e);
  });
  window.addEventListener("unhandledrejection", function(e) { showToast("⚠️ 请求异常，请检查 TTS+AI 服务是否正常运行。"); console.error(e); });
  initTheme();
  initCardGlow();
  initBkConfirmKey(); // P1-1 ESC 关闭自定义确认框
  navigate("home");
  // 首次访问：显示新手引导
  if (!localStorage.getItem("korean_onboarded")) { setTimeout(showOnboarding, 300); }
  // 移动端：点击抽屉与遮罩之外的区域时兜底收起（遮罩自身 onclick 已是主关闭途径，此处幂等）
  document.addEventListener("click", function(e) {
    var nav = document.getElementById("mainNav");
    if (nav && nav.classList.contains("drawer-open") && !(e.target.closest && e.target.closest(".header")) && !(e.target.closest && e.target.closest(".nav"))) {
      closeMobileDrawer();
    }
  });
  // 全局键盘快捷键 1-8 切换页面（输入框内/带修饰键时不触发，避免误触）
  var KEY_PAGE_MAP = { "1":"home", "2":"skeleton", "3":"training", "4":"stems", "5":"ai", "6":"scene", "7":"schedule", "8":"wordlist", "9":"wordlist" };
  document.addEventListener("keydown", function(e) {
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "?") { e.preventDefault(); toggleShortcutsHelp(); return; }
    // 0 = 统计仪表盘：index.html 的 title 一直宣称「按 0」但从未绑定过（Iteration 008 修复的存量 bug）
    if (e.key === "0") { e.preventDefault(); openStats(); return; }
    // 抽认卡复习态键盘操作：空格翻面 / ←→ 切卡（Iteration 011）。
    // 仅 wordListReviewMode 时接管，数字导航等既有行为不受影响。
    if (wordListReviewMode) {
      if (e.key === " ") {
        var card = document.querySelector(".flashcard");
        if (card) { e.preventDefault(); flipWordCard(card); }
        return;
      }
      if (e.key === "ArrowRight") { e.preventDefault(); nextWordCard(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); prevWordCard(); return; }
    }
    var page = KEY_PAGE_MAP[e.key];
    if (page) { e.preventDefault(); navigate(page); }
  });
});
