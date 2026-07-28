// Basic Korean Web App - Main Application
// ============================================

// ============================================
// 统一色彩系统 - 词性 → CSS class
// ============================================
// TTS / AI 服务地址：前端只连本地，需与 tts_server 绑定的 127.0.0.1 保持一致
var TTS_BASE = "http://" + "127.0.0.1:1234";

var APP_VERSION = "1.0.0";
var APP_LAST_COMMIT = "78da555 feat: 交叉链接";

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
function shouldShowTip(id) { return !(JSON.parse(localStorage.getItem("korean_dismissed_tips") || "{}")[id]); }
function dismissTip(btn, id) {
  var d = JSON.parse(localStorage.getItem("korean_dismissed_tips") || "{}");
  d[id] = true;
  localStorage.setItem("korean_dismissed_tips", JSON.stringify(d));
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
}
function closeStats() {
  var el = document.getElementById("statsOverlay");
  if (el) el.remove();
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
function renderStatsContent() {
  var progress = JSON.parse(localStorage.getItem("korean_progress") || "{}");
  var trainingDone = JSON.parse(localStorage.getItem("korean_training_done") || "{}");
  var aiHistory = JSON.parse(localStorage.getItem("korean_ai_history") || "[]");
  var sceneHistory = JSON.parse(localStorage.getItem("korean_scene_history") || "[]");
  var scheduleTotal = SCHEDULE.reduce(function(s, d) { return s + d.tasks.length; }, 0);
  var scheduleDone = Object.values(progress).filter(function(v) { return v; }).length;
  var trainingDoneCount = Object.values(trainingDone).filter(function(v) { return v; }).length;
  var totalSentences = SENTENCES.length;
  var theme = document.documentElement.getAttribute("data-theme") === "dark" ? "暗色" : "亮色";
  return '' +
    '<div class="stats-modal">' +
      '<button class="stats-close" onclick="closeStats()">✕</button>' +
      '<h2>📊 学习统计</h2>' +
      '<div class="stats-row"><span>📝 抽丝训练</span><span class="stat-value">' + trainingDoneCount + ' / ' + totalSentences + ' 句</span></div>' +
      '<div class="stats-row"><span>🗓️ 润物表</span><span class="stat-value">' + scheduleDone + ' / ' + scheduleTotal + ' 项</span></div>' +
      '<div class="stats-row"><span>🤖 AI 练句</span><span class="stat-value">' + aiHistory.length + ' 次</span></div>' +
      '<div class="stats-row"><span>💬 情景对话</span><span class="stat-value">' + sceneHistory.length + ' 场</span></div>' +
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

// 清空指定 localStorage 数据（带确认）
function clearData(key, name) {
  if (!confirm('确定将「' + name + '」清空？此操作不可恢复。')) return;
  var keys = key === "ALL" ? ["korean_training_done","korean_progress","korean_ai_history","korean_scene_history","korean_dismissed_tips","korean_custom_scenes","korean_theme"] : [key];
  keys.forEach(function(k) { localStorage.removeItem(k); });
  // 重置模块级变量
  if (key === "ALL" || key === "korean_training_done") { trainingDone = {}; }
  if (key === "ALL" || key === "korean_ai_history") { aiHistory = []; }
  closeStats();
  setTimeout(function() { navigate(currentPage); }, 100);
  showToast('已清空「' + name + '」');
}

// 导出全部学习数据为 JSON 备份文件
function exportAllData() {
  var keys = ["korean_training_done","korean_progress","korean_ai_history","korean_scene_history","korean_custom_scenes","korean_dismissed_tips","korean_theme","korean_voice","korean_onboarded"];
  var data = {};
  keys.forEach(function(k) {
    var v = localStorage.getItem(k);
    if (v !== null) data[k] = JSON.parse(v);
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
      if (!confirm("确定导入备份？此操作会覆盖当前所有学习数据。")) return;
      var count = 0;
      Object.keys(data).forEach(function(k) {
        localStorage.setItem(k, JSON.stringify(data[k]));
        count++;
      });
      showToast("✅ 已导入 " + count + " 项数据，刷新页面后生效");
      closeStats();
      setTimeout(function() { location.reload(); }, 1000);
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
var trainingDone = JSON.parse(localStorage.getItem("korean_training_done") || "{}");

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

// 获取用户选择的 TTS 语音
function getVoice() {
  return localStorage.getItem("korean_voice") || "ko-KR-SunHiNeural";
}
function setVoice(voice) {
  localStorage.setItem("korean_voice", voice);
  showToast("已切换语音，下次播放时生效");
}

function speakKorean(text) {
  // 如果缓存里有，直接播
  if (audioCache[text]) {
    audioCache[text].play();
    return;
  }

  // 尝试从本地 TTS 服务器获取（携带语音偏好）
  var voice = getVoice();
  var audio = new Audio(TTS_BASE + "/tts?text=" + encodeURIComponent(text) + "&voice=" + encodeURIComponent(voice));

  audio.addEventListener("canplaythrough", function() {
    ttsAvailable = true;
  });

  audio.addEventListener("error", function() {
    // TTS 服务不可用，降级到浏览器 Web Speech API
    if (ttsAvailable === null) ttsAvailable = false;
    if (window.speechSynthesis) {
      var utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ko-KR";
      utter.rate = 0.9;
      speechSynthesis.speak(utter);
      showToast("TTS 服务未启动，使用浏览器内置语音（音质较低）");
    } else {
      showToast("⚠️ 无法播放音频，请启动 TTS 服务：node tts_server.js");
    }
  });

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

function playBtn(text, size) {
  var sizeStyle = size === "small" ? "font-size:14px;padding:2px 8px;" : "font-size:16px;padding:4px 12px;";
  var encoded = encodeURIComponent(text);
  return '<button class="korean-speak-btn" data-text="' + encoded + '" onclick="event.stopPropagation(); speakKorean(decodeURIComponent(this.getAttribute(\'data-text\')))" style="' + sizeStyle + 'background:var(--primary);color:white;border:none;border-radius:6px;cursor:pointer;margin-left:8px;vertical-align:middle;line-height:1.4;font-family:inherit;" title="点击播放韩语发音">🔊</button>';
}
var revealObserver = null;
var currentPage = "home";

function navigate(page) {
  // 关闭移动端菜单（无论 Vue 是否激活都要执行）
  var nav = document.getElementById('mainNav');
  if (nav && nav.classList.contains('show')) {
    nav.classList.remove('show');
    var btn = document.querySelector('.mobile-menu-btn');
    if (btn) btn.textContent = '☰';
  }

  currentPage = page;
  document.querySelectorAll(".nav-item").forEach(el => {
    var match = el.dataset.page === page || (page === "sceneChat" && el.dataset.page === "scene");
    el.classList.toggle("active", match);
  });

  // 如果 Vue 已激活，委托路由并异步执行页面副作用
  if (window.vueApp && typeof window.vueApp.navigate === 'function') {
    window.vueApp.navigate(page);

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
    main.classList.remove("page-enter");
    void main.offsetWidth; // force reflow
    main.classList.add("page-enter");
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

function toggleMobileMenu() {
  document.getElementById("mainNav").classList.toggle("show");
}

// Render routing
function renderPage(page) {
  const pages = {
    home: renderHome,
    skeleton: renderSkeleton,
    training: renderTraining,
    stems: renderStems,
    schedule: renderSchedule,
    reference: renderReference,
    ai: renderAI,
    scene: renderScene,
    sceneChat: renderSceneChat
  };
  return (pages[page] || renderHome)();
}


// === HOME PAGE ===
function renderHome() {
  return `
    <section class="hero">
      <h1>🇰🇷 Basic Korean</h1>
      <p>用"最小可行系统"启动韩语学习。<br>先建立骨架，再添加血肉，两周内拥有完整的韩语地图。</p>
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
        <div class="hero-card" onclick="navigate('reference')">
          <div class="icon">🏷️</div>
          <h3>标签拾遗表</h3>
          <p>助词、词尾、疑问词一览，快速查找</p>
        </div>
      </div>
    </section>
    <div style="text-align:center;margin-top:20px;color:var(--text-light);font-size:13px;">
      <p>💡 建议顺序：筑基 → 抽丝 → 剥茧 → 砥砺 → 临境 → 润物 → 拾遗</p>
    </div>
  `;
}

// 骨架规则跳转（从断句/AI 结果点击规则编号直达骨架页并展开）
var pendingRule = null;
function jumpToRule(n) { pendingRule = n; navigate("skeleton"); }

// === SKELETON PAGE ===
function renderSkeleton() {
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
  var main = document.getElementById("mainContent");
  main.innerHTML = renderTraining();
  main.classList.remove("page-enter");
  void main.offsetWidth;
  main.classList.add("page-enter");
  var items = main.querySelectorAll(".sentence-card");
  items.forEach(function(item, i) {
    item.style.animationDelay = Math.min(i * 0.04, 0.4) + "s";
  });
  initRevealObserver();
}

// 标记/取消"已掌握"，持久化并刷新计数（不整页重渲染以保留滚动与展开态）
function toggleMastered(id, btn) {
  trainingDone[id] = !trainingDone[id];
  localStorage.setItem("korean_training_done", JSON.stringify(trainingDone));
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
        <div class="stem">${s.stem}${playBtn(s.stem, "small")}${irregBadge}</div>
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
  { day: 1, title: "通读筑基地图", tasks: ["读 7 大筑基规则", "读拾遗表", "找一段韩语歌词，试着找出 은/는/을/를/에/요"] },
  { day: 2, title: "助词识别训练", tasks: ["复习助词表", "做抽丝训练 #1-5 自我介绍（三遍法）", "学动词词干 1-10 号"] },
  { day: 3, title: "时态识别训练", tasks: ["复习时态词尾", "做抽丝训练 #6-10 日常动作+描述", "学动词词干 11-20 号"] },
  { day: 4, title: "描述与否定", tasks: ["复习规则 ①②③⑥", "做抽丝训练 #11-15 否定句+疑问命令", "学形容词词干 1-10 号"] },
  { day: 5, title: "连接词尾", tasks: ["复习规则 ⑤", "做抽丝训练 #16-20 连接词尾", "学动词词干 21-35 号"] },
  { day: 6, title: "购物点餐场景", tasks: ["做抽丝训练 #21-24 购物点餐", "练习点餐对话：이거 얼마예요? / 주세요", "学动词词干 36-52 号"] },
  { day: 7, title: "第一周总复习", tasks: ["不看标注尝试断句 #1-20", "遮住拾遗表说含义", "自造 3 个简单句子"] },
  { day: 8, title: "问路交通场景", tasks: ["做抽丝训练 #25-28 问路交通", "练习问路对话：어디에 있어요? / 오른쪽으로", "复习形容词词干 1-20 号"] },
  { day: 9, title: "时间计划场景", tasks: ["做抽丝训练 #29-32 时间计划", "练习约会对话：몇 시에 만날까요?", "学形容词词干 21-32 号"] },
  { day: 10, title: "请求感谢场景", tasks: ["做抽丝训练 #33-36 请求感谢", "练习请求对话：주세요 / 좀 부탁해요", "复习全部动词词干"] },
  { day: 11, title: "情感感受场景", tasks: ["做抽丝训练 #37-43 情感感受+新词尾", "练习表达心情：기분이 좋아요 / 피곤해요", "复习全部形容词词干"] },
  { day: 12, title: "连接词尾实战", tasks: ["复习 -고/-서/-지만/-면", "造 5 个复合句", "用 -고 싶어요 造 3 个愿望句"] },
  { day: 13, title: "自由输出", tasks: ["写 100 字韩语日记", "朗读 3 遍，注意语调", "用学过的句型造 10 个新句子"] },
  { day: 14, title: "两周总验收", tasks: ["断句 43 句正确率 70% 以上", "用 -요 体做自我介绍+问答", "掌握 84 个词干 + 43 个核心句型"] }
];

function renderSchedule() {

  let progress = JSON.parse(localStorage.getItem("korean_progress") || "{}");

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
  let progress = JSON.parse(localStorage.getItem("korean_progress") || "{}");
  progress[key] = el.classList.contains("done");
  localStorage.setItem("korean_progress", JSON.stringify(progress));
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

// === REFERENCE PAGE ===
function renderReference() {
  function endingCls(e) {
    var m = e.meaning || "", t = e.type || "";
    if (m.includes("过去") || m.includes("未来") || m.includes("正在")) return "elem-ending-tense";
    if (t.includes("连接")) return "elem-ending-connective";
    if (t.includes("命令") || t.includes("提议") || t.includes("疑问") || t.includes("确认") || t.includes("请求") || t.includes("征求") || t.includes("感慨")) return "elem-mood";
    return "elem-ending-terminal";
  }
  function levelBadge(lv) {
    var cls = lv === "核心" ? "level-badge-core" : lv === "常用" ? "level-badge-common" : "level-badge-optional";
    return '<span class="' + cls + '">' + lv + '</span>';
  }

  let particlesHtml = REFERENCE.particles.map(p => `
    <tr class="ref-row">
      <td><span class="elem-tag elem-particle" style="font-size:14px;padding:2px 10px;border-radius:99px;">${p.tag}</span></td>
      <td>${p.type}</td>
      <td>${p.meaning}</td>
      <td>${levelBadge(p.level)}</td>
      <td style="font-size:13px;color:var(--text-light);">${p.example}${playBtn(p.example, "small")}</td>
    </tr>
  `).join("");

  let endingsHtml = REFERENCE.endings.map(e => `
    <tr class="ref-row">
      <td><span class="elem-tag ${endingCls(e)}" style="font-size:14px;padding:2px 10px;border-radius:99px;">${e.tag}</span></td>
      <td>${e.type}</td>
      <td>${e.meaning}</td>
      <td>${levelBadge(e.level)}</td>
      <td style="font-size:13px;color:var(--text-light);">${e.example}${playBtn(e.example, "small")}</td>
    </tr>
  `).join("");

  let qwordsHtml = REFERENCE.questionWords.map(q => `
    <span class="ref-qword" style="display:inline-block;padding:6px 14px;background:var(--bg);border-radius:8px;margin:4px;border:1px solid var(--border);">
      <strong style="font-size:18px;font-family:'Noto Sans KR',sans-serif;">${q.word}</strong>${playBtn(q.word, "small")}
      <span style="color:var(--text-light);margin-left:6px;font-size:13px;">= ${q.meaning}</span>
    </span>
  `).join("");

  return `
    <div class="page-title">
      <h2>🏷️ 标签拾遗表</h2>
      <p>看到以下标签立刻知道"前面这个词是什么角色"。建议截图或打印。</p>
    </div>

    ${renderColorLegend()}

    <div style="margin-bottom:16px;">
      <input id="refSearch" class="ai-input" style="width:100%;box-sizing:border-box;" placeholder="🔍 搜索助词 / 词尾 / 疑问词（如：主题、과거、뭐）" oninput="filterReference(this.value)" />
    </div>

    <div class="card ref-section">
      <div class="card-title">🔴 助词 <span class="badge badge-red">${REFERENCE.particles.length} 个</span></div>
      <table class="ref-table">
        <thead><tr><th>助词</th><th>类型</th><th>含义</th><th>优先级</th><th>例句</th></tr></thead>
        <tbody>${particlesHtml}</tbody>
      </table>
    </div>

    <div class="card ref-section">
      <div class="card-title">🟠 词尾 <span class="badge badge-orange">${REFERENCE.endings.length} 个</span></div>
      <table class="ref-table">
        <thead><tr><th>词尾</th><th>类型</th><th>含义</th><th>优先级</th><th>例句</th></tr></thead>
        <tbody>${endingsHtml}</tbody>
      </table>
    </div>

    <div class="card ref-section">
      <div class="card-title">❓ 疑问词 <span class="badge badge-green">${REFERENCE.questionWords.length} 个</span></div>
      <div>${qwordsHtml}</div>
    </div>

    <div style="margin-top:20px;padding:16px;background:var(--accent-light);border-radius:var(--radius-sm);font-size:14px;">
      <strong>⚡ 速查口诀</strong><br>
      看到 은/는 → 主题来了<br>
      看到 을/를 → 宾语来了<br>
      看到 에/에서 → 地点来了<br>
      看到 어요/어요? → 句子结束/疑问<br>
      看到 고/서/지만 → 句子未完！
    </div>
  `;
}

// 参考页实时搜索：按文本过滤行，并隐藏无命中分组
function filterReference(q) {
  q = (q || "").trim().toLowerCase();
  document.querySelectorAll("#mainContent .ref-row, #mainContent .ref-qword").forEach(function(el) {
    var hit = !q || el.textContent.toLowerCase().includes(q);
    el.classList.toggle("ref-hidden", !hit);
  });
  document.querySelectorAll("#mainContent .ref-section").forEach(function(sec) {
    var any = sec.querySelector(".ref-row:not(.ref-hidden), .ref-qword:not(.ref-hidden)");
    sec.style.display = any ? "" : "none";
  });
}

// === AI PAGE ===
var aiLoading = false;
var aiHistory = [];

function renderAI() {
  // 加载历史记录
  aiHistory = JSON.parse(localStorage.getItem("korean_ai_history") || "[]");
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

// 构建练习历史列表 HTML（最近 6 条，含删除按钮）
function buildAIHistoryHtml() {
  if (!aiHistory.length) return '<p style="color:var(--text-light);font-size:13px;">还没有练习记录，试试输入一句中文吧</p>';
  return aiHistory.slice(-6).reverse().map(function(h) {
    return '<div class="ai-history-item" onclick="askAI(\'' + (h.input || "").replace(/'/g, "\\'") + '\')">' +
      '<span class="ai-history-input">' + escapeHtml(h.input || "") + '</span>' +
      '<span class="ai-history-kr">' + escapeHtml(h.kr || "") + '</span>' +
      '<button class="ai-history-del" onclick="event.stopPropagation(); deleteAIHistory(\'' + h.id + '\')" title="删除">✕</button>' +
    '</div>';
  }).join("");
}

function deleteAIHistory(id) {
  aiHistory = aiHistory.filter(function(h) { return h.id !== id; });
  localStorage.setItem("korean_ai_history", JSON.stringify(aiHistory));
  var list = document.querySelector(".ai-history-list");
  if (list) list.innerHTML = buildAIHistoryHtml();
  var cnt = document.getElementById("aiHistoryCount");
  if (cnt) cnt.textContent = aiHistory.length;
}

function clearAIHistory() {
  if (!aiHistory.length) { showToast("练习历史已为空"); return; }
  aiHistory = [];
  localStorage.setItem("korean_ai_history", JSON.stringify(aiHistory));
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
    localStorage.setItem("korean_ai_history", JSON.stringify(aiHistory));

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
          ${escapeHtml(data.kr)}${playBtn(data.kr, "small")}<button class="korean-copy-btn" onclick="event.stopPropagation(); navigator.clipboard.writeText('${data.kr.replace(/'/g, "\\'")}').then(function(){showToast('已复制韩语句子')}).catch(function(){showToast('复制失败，请手动选中')})" title="复制韩语句子">📋</button>
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
  sceneTitle: "",
  scenePrompt: "",
  messages: [],     // {role: 'user'|'assistant', kr, zh, breakdown}
  loading: false,
  muted: false,
  keySet: new Set() // 复习时标记的重点句索引
};

function renderScene() {
  // 加载自定义场景
  var customScenes = JSON.parse(localStorage.getItem("korean_custom_scenes") || "[]");

  var presetHtml = SCENE_PRESETS.map(function(s) {
    return '<div class="scene-card" onclick="startSceneChat(\'' + s.id + '\', \'' + s.title.replace(/'/g, "\\'") + '\', \'' + s.prompt.replace(/'/g, "\\'") + '\')">' +
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
      return '<div class="scene-card scene-card-custom" onclick="startSceneChat(\'custom-' + i + '\', \'' + s.title.replace(/'/g, "\\'") + '\', \'' + s.prompt.replace(/'/g, "\\'") + '\')">' +
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
      (customHtml ? '<div class="scene-grid">' + customHtml + '</div>' : '<p class="scene-empty">还没有自定义场景，在下方创建一个吧</p>') +
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

  var custom = JSON.parse(localStorage.getItem("korean_custom_scenes") || "[]");
  custom.push({ title: title, prompt: prompt, icon: "🎯", desc: prompt.substring(0, 40) + "..." });
  localStorage.setItem("korean_custom_scenes", JSON.stringify(custom));
  showToast("场景已保存！");
  navigate("scene");
}

function deleteCustomScene(idx) {
  var custom = JSON.parse(localStorage.getItem("korean_custom_scenes") || "[]");
  custom.splice(idx, 1);
  localStorage.setItem("korean_custom_scenes", JSON.stringify(custom));
  showToast("已删除");
  navigate("scene");
}

// === 对话界面 ===
function startSceneChat(id, title, prompt) {
  sceneChatState.active = true;
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
          '<div class="chat-kr">' + escapeHtml(m.kr || '') + playBtn(m.kr || '', "small") + '</div>' +
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
          '<p>准备好了吗？点击开始，AI 会先向你说话</p>' +
          '<button class="ai-submit-btn chat-start-btn" onclick="startFirstMessage()">🚀 开始对话</button>' +
        '</div>' : '') +
      (sceneChatState.messages.length > 0 ? msgsHtml : '') +
      loadingHtml +
    '</div>' +
    '<div class="chat-input-bar">' +
      '<button class="chat-mute-btn" id="muteBtn" onclick="toggleSceneMute()" title="静音/取消静音">' + (sceneChatState.muted ? '🔇' : '🔊') + '</button>' +
      '<input type="text" id="chatInput" class="ai-input" placeholder="输入中文或韩文回答…" onkeydown="if(event.key===\'Enter\') sendChatMessage()" />' +
      '<button class="ai-submit-btn" onclick="sendChatMessage()" id="chatSendBtn">发送</button>' +
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
  // Vue 激活时：触发场景组件重新渲染（通过重新导航）
  if (window.vueApp && typeof window.vueApp.navigate === 'function') {
    window.vueApp.navigate("sceneChat");
    return;
  }
  // 传统模式：直接替换内容
  var main = document.getElementById("mainContent");
  main.innerHTML = renderSceneChat();
  main.classList.remove("page-enter");
  void main.offsetWidth;
  main.classList.add("page-enter");
}

function scrollChatToBottom() {
  var container = document.getElementById("chatContainer");
  if (container) container.scrollTop = container.scrollHeight;
}

function exitSceneChat() {
  sceneChatState.active = false;
  sceneChatState.messages = [];
  navigate("scene");
}

// 结束对话 → 复习模式
function finishSceneChat() {
  if (sceneChatState.messages.length === 0) {
    exitSceneChat();
    return;
  }

  // 保存对话记录
  var history = JSON.parse(localStorage.getItem("korean_scene_history") || "[]");
  history.push({
    title: sceneChatState.sceneTitle,
    time: Date.now(),
    messages: sceneChatState.messages
  });
  if (history.length > 20) history.shift();
  localStorage.setItem("korean_scene_history", JSON.stringify(history));

  // 渲染复习界面
  renderSceneReview();
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

  var main = document.getElementById("mainContent");
  main.innerHTML = '' +
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

  main.classList.remove("page-enter");
  void main.offsetWidth;
  main.classList.add("page-enter");
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
  navigate("home");
  // 首次访问：显示新手引导
  if (!localStorage.getItem("korean_onboarded")) { setTimeout(showOnboarding, 300); }
  // 移动端：点击页面其它区域（header 之外）时收起导航下拉
  document.addEventListener("click", function(e) {
    var nav = document.getElementById("mainNav");
    if (nav && nav.classList.contains("show") && !(e.target.closest && e.target.closest(".header"))) {
      nav.classList.remove("show");
    }
  });
  // 全局键盘快捷键 1-8 切换页面（输入框内/带修饰键时不触发，避免误触）
  var KEY_PAGE_MAP = { "1":"home", "2":"skeleton", "3":"training", "4":"stems", "5":"ai", "6":"scene", "7":"schedule", "8":"reference" };
  document.addEventListener("keydown", function(e) {
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var page = KEY_PAGE_MAP[e.key];
    if (page) { e.preventDefault(); navigate(page); }
  });
});
