// Basic Korean Web App - Main Application
// ============================================

// ============================================
// 统一色彩系统 - 词性 → CSS class
// ============================================
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
// 骨架规则映射 - 拆解项 → 骨架规则编号
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
  return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + r.color + '20;color:' + r.color + ';font-weight:600;margin-left:4px;white-space:nowrap;">' + r.icon + ' ' + r.name + '</span>';
}

// ============================================
// Web Speech API - 韩语语音播放
// ============================================

// 音频缓存（已生成的就不重复请求）
var audioCache = {};
var ttsAvailable = null; // null=未检测, true=可用, false=不可用

function speakKorean(text) {
  // 如果缓存里有，直接播
  if (audioCache[text]) {
    audioCache[text].play();
    return;
  }

  // 尝试从本地 TTS 服务器获取
  var audio = new Audio("http://127.0.0.1:1234/tts?text=" + encodeURIComponent(text));

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
  currentPage = page;
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });
  var main = document.getElementById("mainContent");
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
    ai: renderAI
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
          <h3>7 大骨架规则</h3>
          <p>韩语语法的承重墙——先立起来房子不会倒</p>
        </div>
        <div class="hero-card" onclick="navigate('training')">
          <div class="icon">🃏</div>
          <h3>断句训练</h3>
          <p>43 句逐词拆解，学会"看标签"而不是"看单词"</p>
        </div>
        <div class="hero-card" onclick="navigate('stems')">
          <div class="icon">📝</div>
          <h3>核心词干</h3>
          <p>84 个最常用词干（动词 + 形容词）</p>
        </div>
        <div class="hero-card" onclick="navigate('schedule')">
          <div class="icon">🗓️</div>
          <h3>两周日课表</h3>
          <p>每天 20 分钟，从零到能造简单句子</p>
        </div>
        <div class="hero-card hero-card-wide" onclick="navigate('ai')">
          <div class="icon">🤖</div>
          <h3>AI 智能练句</h3>
          <p>输入任意中文，AI 自动翻译、拆解词性、标注骨架规则，按你的学习体系生成教学内容</p>
        </div>
      </div>
    </section>
    <div style="text-align:center;margin-top:20px;color:var(--text-light);font-size:13px;">
      <p>💡 建议顺序：骨架地图 → 断句训练 → 词干 → 按日课表执行</p>
    </div>
  `;
}

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
          <p style="color:var(--text-light);font-size:14px;padding:8px 0;border-bottom:1px solid var(--border);margin-bottom:12px;">${rule.details.replace(/\\n/g, "<br>")}</p>
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
      <h2>🏗️ 7 大骨架规则</h2>
      <p>韩语语法的承重墙。先建立地图感，细节在练习中自然补齐。</p>
    </div>
    <div style="margin-bottom:20px;padding:16px;background:var(--primary-lighter);border-radius:var(--radius-sm);font-size:14px;">
      <strong>🎯 目标：</strong>不是精通，而是知道"有这 7 个东西存在"。
      每个规则看一遍例句拆解，你就知道韩语的语法地图长什么样了。<br>
      <strong>🔗 联动：</strong>断句训练页的每个词都标注了对应的骨架规则编号，可与本页对照学习。
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

// === TRAINING PAGE ===
let trainingFilter = "all";

function renderTraining() {
  let groups = [...new Set(SENTENCES.map(s => s.group))];
  let filterBtns = ['<button class="filter-btn active" onclick="setTrainingFilter(\'all\')">全部</button>']
    .concat(groups.map(g => `<button class="filter-btn" onclick="setTrainingFilter('${g}')">${g}</button>`))
    .join("");

  let sentencesHtml = SENTENCES.filter(s => trainingFilter === "all" || s.group === trainingFilter).map(s => {
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

    return `
      <div class="sentence-card" onclick="toggleBreakdown(this)">
        <div class="sentence-num">#${s.id} · ${s.group}</div>
        <div class="kr">${s.kr}${playBtn(s.kr, "small")}</div>
        <div class="breakdown">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">🔍 逐词拆解</div>
          <div class="breakdown-row">${breakdownHtml}</div>
          <div style="margin-top:8px;font-size:14px;color:var(--text-light);">→ ${s.full}</div>
          <div style="margin-top:8px;font-size:12px;color:var(--text-light);">📐 涉及骨架规则：${ruleSummary}</div>
          ${tipHtml}
        </div>
        <div style="font-size:12px;color:var(--text-light);margin-top:4px;">👆 点击展开拆解</div>
      </div>
    `;
  }).join("");

  return `
    <div class="page-title">
      <h2>🃏 断句训练</h2>
      <p>三遍法：① 圈出助词和词尾 ② 说出每个标签的功能 ③ 不看标注猜意思</p>
    </div>
    <div style="margin-bottom:20px;padding:16px;background:var(--accent-light);border-radius:var(--radius-sm);font-size:14px;">
      <strong>💡 训练方法：</strong>先自己尝试断句，再点击展开看拆解。
      每天 3-5 句，两周内完成全部 43 句。
    </div>
    ${renderColorLegend()}
    <div class="filter-bar">${filterBtns}</div>
    ${sentencesHtml}
  `;
}

function setTrainingFilter(group) {
  trainingFilter = group;
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", (group === "all" && btn.textContent === "全部") || btn.textContent === group);
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

function toggleBreakdown(el) {
  const bd = el.querySelector(".breakdown");
  bd.classList.toggle("show");
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
      <h2>📝 核心词干清单</h2>
      <p>词干 + 词尾 = 完整的韩语动词/形容词。先记词干，再套规则。</p>
    </div>
    <div style="margin-bottom:16px;padding:14px;background:var(--primary-lighter);border-radius:var(--radius-sm);font-size:13px;line-height:1.8;">
      <strong>📌 使用建议</strong><br>
      • 每天学 10 个词干，2 周学完全部<br>
      • 不要孤立背——每个词干配 1 个常用搭配一起记<br>
      • 优先掌握动词——前 50 个动词词干覆盖 80% 日常表达
    </div>
    ${catsHtml}
  `;
}

// === SCHEDULE PAGE ===
var SCHEDULE = [
  { day: 1, title: "通读骨架地图", tasks: ["读 7 大骨架规则", "读标签速查表", "找一段韩语歌词，试着找出 은/는/을/를/에/요"] },
  { day: 2, title: "助词识别训练", tasks: ["复习助词表", "做断句训练 #1-5 自我介绍（三遍法）", "学动词词干 1-10 号"] },
  { day: 3, title: "时态识别训练", tasks: ["复习时态词尾", "做断句训练 #6-10 日常动作+描述", "学动词词干 11-20 号"] },
  { day: 4, title: "描述与否定", tasks: ["复习规则 ①②③⑥", "做断句训练 #11-15 否定句+疑问命令", "学形容词词干 1-10 号"] },
  { day: 5, title: "连接词尾", tasks: ["复习规则 ⑤", "做断句训练 #16-20 连接词尾", "学动词词干 21-35 号"] },
  { day: 6, title: "购物点餐场景", tasks: ["做断句训练 #21-24 购物点餐", "练习点餐对话：이거 얼마예요? / 주세요", "学动词词干 36-52 号"] },
  { day: 7, title: "第一周总复习", tasks: ["不看标注尝试断句 #1-20", "遮住速查表说含义", "自造 3 个简单句子"] },
  { day: 8, title: "问路交通场景", tasks: ["做断句训练 #25-28 问路交通", "练习问路对话：어디에 있어요? / 오른쪽으로", "复习形容词词干 1-20 号"] },
  { day: 9, title: "时间计划场景", tasks: ["做断句训练 #29-32 时间计划", "练习约会对话：몇 시에 만날까요?", "学形容词词干 21-32 号"] },
  { day: 10, title: "请求感谢场景", tasks: ["做断句训练 #33-36 请求感谢", "练习请求对话：주세요 / 좀 부탁해요", "复习全部动词词干"] },
  { day: 11, title: "情感感受场景", tasks: ["做断句训练 #37-43 情感感受+新词尾", "练习表达心情：기분이 좋아요 / 피곤해요", "复习全部形容词词干"] },
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
      <h2>🗓️ 两周日课表</h2>
      <p>每天 20 分钟，不多也不少。关键不是学了多少，而是每天都有。</p>
    </div>
    <div style="margin-bottom:20px;padding:16px;background:var(--primary-lighter);border-radius:var(--radius-sm);font-size:14px;">
      <strong>⚡ 核心原则</strong><br>
      ① 20 分钟到就停——超时容易产生厌倦<br>
      ② 不追求完美——Day 7 能断句 30% 就算成功<br>
      ③ 重复比新学重要——前 7 天反复练 30 句 > 学 100 句但不熟<br>
      ④ 声音很重要——所有句子至少读出声 1 遍
    </div>
    <div style="margin-bottom:16px;padding:14px;background:var(--primary-lighter);border-radius:var(--radius-sm);font-size:14px;">
      <strong>📊 学习进度</strong> ${doneCount} / ${totalCount} (${Math.round(doneCount / totalCount * 100)}%)
      <div style="margin-top:8px;height:8px;background:white;border-radius:4px;overflow:hidden;">
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
    <tr>
      <td><span class="elem-tag elem-particle" style="font-size:14px;padding:2px 10px;border-radius:99px;">${p.tag}</span></td>
      <td>${p.type}</td>
      <td>${p.meaning}</td>
      <td>${levelBadge(p.level)}</td>
      <td style="font-size:13px;color:var(--text-light);">${p.example}${playBtn(p.example, "small")}</td>
    </tr>
  `).join("");

  let endingsHtml = REFERENCE.endings.map(e => `
    <tr>
      <td><span class="elem-tag ${endingCls(e)}" style="font-size:14px;padding:2px 10px;border-radius:99px;">${e.tag}</span></td>
      <td>${e.type}</td>
      <td>${e.meaning}</td>
      <td>${levelBadge(e.level)}</td>
      <td style="font-size:13px;color:var(--text-light);">${e.example}${playBtn(e.example, "small")}</td>
    </tr>
  `).join("");

  let qwordsHtml = REFERENCE.questionWords.map(q => `
    <span style="display:inline-block;padding:6px 14px;background:var(--bg);border-radius:8px;margin:4px;border:1px solid var(--border);">
      <strong style="font-size:18px;font-family:'Noto Sans KR',sans-serif;">${q.word}</strong>${playBtn(q.word, "small")}
      <span style="color:var(--text-light);margin-left:6px;font-size:13px;">= ${q.meaning}</span>
    </span>
  `).join("");

  return `
    <div class="page-title">
      <h2>🏷️ 标签速查表</h2>
      <p>看到以下标签立刻知道"前面这个词是什么角色"。建议截图或打印。</p>
    </div>

    ${renderColorLegend()}

    <div class="card">
      <div class="card-title">🔴 助词 <span class="badge badge-red">${REFERENCE.particles.length} 个</span></div>
      <table class="ref-table">
        <thead><tr><th>助词</th><th>类型</th><th>含义</th><th>优先级</th><th>例句</th></tr></thead>
        <tbody>${particlesHtml}</tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">🟠 词尾 <span class="badge badge-orange">${REFERENCE.endings.length} 个</span></div>
      <table class="ref-table">
        <thead><tr><th>词尾</th><th>类型</th><th>含义</th><th>优先级</th><th>例句</th></tr></thead>
        <tbody>${endingsHtml}</tbody>
      </table>
    </div>

    <div class="card">
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

// === AI PAGE ===
var aiLoading = false;
var aiHistory = [];

function renderAI() {
  // 加载历史记录
  aiHistory = JSON.parse(localStorage.getItem("korean_ai_history") || "[]");

  var historyHtml = aiHistory.length > 0 ? aiHistory.slice(-6).reverse().map(function(h, i) {
    return '<div class="ai-history-item" onclick="askAI(\'' + h.input.replace(/'/g, "\\'") + '\')">' +
      '<span class="ai-history-input">' + h.input + '</span>' +
      '<span class="ai-history-kr">' + h.kr + '</span>' +
    '</div>';
  }).join("") : '<p style="color:var(--text-light);font-size:13px;">还没有练习记录，试试输入一句中文吧</p>';

  return `
    <div class="page-title">
      <h2>🤖 AI 智能练句</h2>
      <p>输入任意中文句子，AI 会自动翻译成韩语并按你的学习体系拆解词性、助词、词尾和骨架规则</p>
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

    <div id="aiResult"></div>

    <div class="ai-history-section">
      <h3 style="font-size:16px;margin-bottom:12px;color:var(--text-light);">📜 最近练习</h3>
      <div class="ai-history-list">${historyHtml}</div>
    </div>
  `;
}

function askAI(presetText) {
  if (aiLoading) return;

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

  fetch("http://127.0.0.1:1234/ai", {
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

    // 保存到历史
    aiHistory.push({ input: input, kr: data.kr, full: data.full, data: data, time: Date.now() });
    if (aiHistory.length > 30) aiHistory.shift();
    localStorage.setItem("korean_ai_history", JSON.stringify(aiHistory));

    // 渲染结果
    renderAIResult(data, resultDiv);

    // 刷新历史列表
    var histSection = document.querySelector(".ai-history-list");
    if (histSection) {
      var newHistoryHtml = aiHistory.slice(-6).reverse().map(function(h) {
        return '<div class="ai-history-item" onclick="askAI(\'' + h.input.replace(/'/g, "\\'") + '\')">' +
          '<span class="ai-history-input">' + h.input + '</span>' +
          '<span class="ai-history-kr">' + h.kr + '</span>' +
        '</div>';
      }).join("");
      histSection.innerHTML = newHistoryHtml;
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
      '<strong>' + b.part + '</strong>' +
      '<span class="elem-tag ' + elemCls + '" style="font-size:10px;padding:1px 6px;margin-left:4px;">' + (b.label || b.tag) + '</span>' +
      ruleBadge(ruleNum) +
      '<span class="mean">' + b.meaning + '</span>' +
    '</div>';
  }).join("");

  var ruleSummary = Array.from(ruleSet).sort().map(function(n) { return ruleBadge(n); }).join(" ");
  var tipHtml = data.tip ? '<div class="ai-tip">🔑 ' + data.tip + '</div>' : "";

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
            '<strong>' + b.part + '</strong>' +
            '<span class="elem-tag ' + cls + '" style="font-size:10px;padding:1px 6px;margin-left:4px;">' + (b.label || b.tag) + '</span>' +
            ruleBadge(rn) +
            '<span class="mean">' + b.meaning + '</span>' +
          '</div>';
        }).join("");
        return '<div class="ai-example-card">' +
          '<div class="ai-example-kr">' + ex.kr + playBtn(ex.kr, "small") + '</div>' +
          '<div class="breakdown-row">' + exBreakdown + '</div>' +
          '<div class="ai-example-full">→ ' + ex.full + '</div>' +
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
          ${data.kr}${playBtn(data.kr, "small")}
        </div>
        <div class="breakdown show ai-result-breakdown">
          <div class="breakdown-label">🔍 逐词拆解</div>
          <div class="breakdown-row">${breakdownHtml}</div>
          <div class="ai-result-full">→ ${data.full}</div>
          <div class="ai-result-rules">📐 涉及骨架规则：${ruleSummary}</div>
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

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initCardGlow();
  navigate("home");
});
