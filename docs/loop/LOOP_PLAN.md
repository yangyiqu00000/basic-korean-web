# Basic Korean 持续迭代 Loop 方案（≥4h 自动驾驶）

> 版本：v1.0 ｜ 日期：2026-09-06 ｜ 适用：main 分支
> 前置状态：工作区有一批未提交的移动端改进（导航抽屉 / 拾遗卡片三态 / 复习进度条 / 自检扩展，?v=20260830c）——**Iteration 000 先收口这批 WIP，再开新迭代**。

本方案驱动 agent 在本仓库上连续自主迭代至少 4 小时，覆盖三个维度：

1. **前端 UI 风格维持与优化** —— 不跑偏、不劣化，且持续打磨布局与视觉细节；
2. **功能逻辑升级与优化** —— 在既有架构边界内做真实的功能增强，不做破坏性重构；
3. **Agent vibecoding 行为约束** —— 把 AGENTS.md 的坑点清单变成每轮强制的护栏，防止长 loop 中"越跑越歪"。

---

## 1. 项目结构对照表（agent 改动前必读，命名以此为准）

参照原 prompt 的组件命名表思路，替换为本项目的真实结构。**所有沟通、commit、迭代记录必须使用本表名称。**

| 模块 | 名称 | 载体 | 约束要点 |
|---|---|---|---|
| 入口壳 | **EntryShell** | `index.html` | 脚本加载顺序敏感；`?v=` 版本戳（当前 `20260830c`） |
| 全局逻辑 | **AppCore** | `js/app.js` | `navigate()`、各 `renderXxx()`、`retriggerPageEnter()`、`ELEM_COLORS` |
| 云同步层 | **SyncLayer** | `js/sync.js` | 必须在 AppCore 之后加载；失败仅 `console.warn` 不弹 Toast |
| Vue 路由壳 | **VueRouterShell** | `js/vue-app.js` + `js/components/*.js` | 组件只是 `v-html` 薄壳；新页面要同时改路由表 + index.html + style.css 容器 |
| 数据层 | **DataLayer** | `js/data.js` 等 6 源文件 → 合并产物 `js/data_core.js` / `js/data_ext.js` | **勿手改合并产物**；改源后跑 `bash scripts/rebuild-data.sh` |
| 设计系统 | **DesignSystem** | `css/style.css` | token 三分（见标杆文件）；`elem-*` 词性色 7 类 |
| 页面×8 | **Home 首页** / **Skeleton 筑基** / **Training 剥茧** / **Stems 抽丝** / **AI 砥砺** / **Scene 临境** / **Schedule 润物** / **WordList 拾遗** | `data-page` = home/skeleton/training/stems/ai/scene/schedule/wordlist | 入场动效挂 `.main` |
| 网页服务器 | **WebServer** | `web_server.js` (9999) | 纯静态；403 拦截逻辑不动 |
| TTS+AI 服务器 | **AiTtsServer** | `tts_server.js` (1234) | AI key 只在服务端；TTS 走 edge-tts CLI |
| 云后端 | **CloudFunctions** | `functions/api/*` + `schema.sql` + `wrangler.toml` | D1 绑定在生产 wrangler.toml 需重复声明 |
| 质量门 | **Gates** | `package.json` scripts（见 §4.3） | 每轮必跑，红 = 本轮不成立 |

## 2. 单轮迭代 SOP（每轮严格走 Step1–5）

### Step 1｜问题分析 + 自我反问（必须输出、必须解释、必须附代码）

**问题来源固定四条**（防 agent 凭空臆想）：
- `npm run test:selfcheck` 扫描输出（控制台异常 / 请求失败 / 溢出 / 交互流程）；
- `npm run test:viewport` 375/480/600/769 断点回归；
- 三个静态审计（`audit:strict` / `audit:assets:strict` / `audit:contrast`）的 🟡 警告与 ℹ️ 提示；
- §5 候选队列的下一个条目。

每个问题按以下格式输出（缺一不可）：

```
【问题 N】<一句话标题>
- 现象/证据：<自检输出 | 截图路径 | 代码位置 file:line>
- 反问 1（真实性）：这是我观察到的还是我臆想的？
    → 复核：<贴出关键代码片段，带 file:line>
- 反问 2（性价比）：修复收益/风险比？命中标杆文件或 AGENTS 坑点清单的哪几条？
    → 结论：<命中项列表，如「token 三分」「escapeHtml」>
- 反问 3（最小路径）：最小改动是什么？有没有更简单方案被我跳过？
    → 方案倾向：<一段话>
- 分论点：a) <论点+代码证据>  b) <论点+代码证据>
```

### Step 2｜解决方案与步骤

列出有序步骤，每步标注：涉及文件、是否触碰 §4.2 硬禁区、预计 diff 规模。步骤 >5 步的问题拆成多轮。

### Step 3｜验收标准（先行声明，可执行）

验收标准必须包含三层，写进本轮迭代记录：

1. **命令级**：`npm run audit:strict && npm run audit:assets:strict && npm run audit:contrast` 全绿；涉及 JS 行为加 `PW_CHANNEL=chrome npm run test:e2e:ci`；涉及布局加 `npm run test:viewport`；涉及交互流程加 `npm run test:selfcheck`。
2. **断言级**：可观察的行为/视觉断言清单（例：「375px 下抽屉打开时 documentElement.scrollWidth ≤ innerWidth+1」「body 滚动被锁定」）。凡是可自动化断言的，**必须**写进 `tests/e2e/self-check.js` 或 E2E，成为防复发门。
3. **反例级**：明确写出「出现什么情况不算完成」（例：「若统计弹窗 TTS 下拉被重置，本轮不算完成」）。

### Step 4｜改进

按 Step 2 步骤实施。实施中若发现需要偏离硬禁区（§4.2），**立即停止并在迭代记录中说明，不得绕过**。

### Step 5｜按验收标准验收

跑 Step 3 的全部命令，逐条核对断言级清单。结果（含失败输出原文）写入 `docs/loop/iterations/NNN.md`。

### 收尾动作（每轮固定）

1. 更新 `docs/loop/STATE.md`（轮号、队列指针、遗留事项）；
2. 满足 §4.1 git 条件则 commit；
3. **立即进入下一轮 Step 1**（Strict Rule，不停顿等待确认）。

## 3. Strict Rules（行为约束 = 本 loop 的宪法）

### 4.1 迭代连续性与 git 策略

- **R1 连续迭代**：一轮验收完毕自动开始下一轮，不问「是否继续」；终止条件仅有三个——队列耗尽、累计 4 小时、连续 2 轮无任何可验证改进。
- **R2 有效果才 git**：commit 必须同时满足 ① Step 3 验收全绿 ② 存在可陈述的用户可感改进（不是「改了代码」而是「改了什么体验」）。WIP 未验收不许 commit。
- **R3 一轮一逻辑单元**：一轮对应 ≤1 个 commit；message 沿用项目风格 `feat:|fix:|chore: + 中文摘要`，正文引用迭代记录路径。
- **R4 失败熔断**：同一个问题的修复尝试失败 2 次后，revert 本轮全部改动（`git checkout -- <files>`），在迭代记录里写死失败原因，跳到下一候选。**严禁带病 commit。**
- **R5 每 10 轮标杆对照**：见 §6。对照轮本身不计入改进队列。
- **R6 版本戳**：任何 js/css 改动必须同步 bump `index.html` 的 `?v=`（递增后缀 c→d→e…）与 `sw.js` 的 `CACHE_NAME`。漏 bump = 验收不通过。

### 4.2 硬禁区（每轮 Step 2 前逐条自检，命中即绕行或显式申报）

来自 AGENTS.md「已知坑点」，全部是历史上真实踩过的事故：

1. **数据层**：不手改 `js/data_core.js` / `js/data_ext.js`（合并产物）；改源文件后必须重跑 `bash scripts/rebuild-data.sh`。
2. **前端架构**：不加 `type="module"`、不写 import/export；脚本加载顺序 data_core → data_ext → app.js → sync.js → components → vue-app.js 不可调整。
3. **动效**：入场动效只调 `retriggerPageEnter()`（挂 `.main`），禁止手写 `classList.add("page-enter")`，禁止挂在 `.xxx-page-vue` 根节点。
4. **统计弹窗**：`/api/stats` 到达后只走 `setStatBar()` / `set(id, val)` 局部回填，禁止 `overlay.innerHTML = renderStatsContent()` 整块重渲染（会重置用户正在操作的 TTS 下拉）。
5. **复习记账口径**：只在 `reviewMark()` 记账；`nextWordCard()`（翻页）刻意不记。改动前先读 `docs/design/v2-upgrade-plan.md` §Phase 4.3。
6. **复习日志**：`korean_wordlist_review_log` 只存本地，禁止塞进 `SYNC_BLOB_MAP`（服务端无对应 blob 列会静默丢弃）。
7. **色彩 token 三分**：`--primary`（填充）/ `--on-primary`（其上文字）/ `--primary-ink`（浅底上的主色文字）不混用；`--accent` 只作边框/装饰（文字对比度仅 2.37:1）；新增主色 token 必须同步 `scripts/contrast-audit.js` 的 CONTRACTS。
8. **词性色彩两套解析**：`getElemClassFromMeaning`（骨架/词干页，breakdown 为 `[text, meaning]`）与 `getElemClass`（AI 页，breakdown 为对象）改任一必须同步另一。
9. **XSS**：一切 AI/用户数据字段渲染（`b.part/b.label/b.meaning`、`data.kr/full/tip`、`ex.*`、收藏 text/meaning）必须过 `escapeHtml()`。
10. **密钥与安全**：AI key 永不出现在前端 JS；`web_server.js` 的 403 拦截（ai_config/点文件/路径穿越）不动；`audio/*` 不提交。
11. **静态键名**：localStorage 键名（`korean_progress` / `korean_training_done` / `korean_ai_history` / `korean_custom_scenes` / `korean_scene_history` / `korean_collections` 等）不得更名——云同步按这些 key 对齐。
12. **裸触 DOM**：对 `#vue-root` / `#mainContent` 的未防护写入会被 `audit:strict` 拦截，同页禁止直接 `navigate()` 冲突（Vue 壳已接管路由）。

### 4.3 质量门（Gates，验收命令以此为准）

| 门 | 命令 | 何时必跑 |
|---|---|---|
| Vue 冲突审计 | `npm run audit:strict` | 每轮 |
| 资产完整性 | `npm run audit:assets:strict` | 每轮 |
| 对比度 WCAG AA | `npm run audit:contrast` | 每轮（涉色彩必跑） |
| E2E | `PW_CHANNEL=chrome npm run test:e2e:ci` | 涉 JS 行为/导航 |
| 断点回归 | `npm run test:viewport` | 涉布局/CSS |
| 浏览器自检 | `npm run test:selfcheck` | 涉交互流程 |
| 双设备同步 | `bash tests/e2e/dual-device-ci.sh` | 仅当轮到 §5 受限区（需 CF 凭据） |

基线：E2E 29 PASS、审计 🔴0 🟡0、对比度 16 组、自检抽屉段全绿（见 `docs/loop/标杆.md`）。**任何门低于基线 = 本轮失败。**

### 4.4 上下文续接（4 小时跨窗口的关键机制）

长 loop 必然穿越上下文压缩。续接协议：

- 每轮结束写 `docs/loop/iterations/NNN.md`（模板见 §8）；
- 每轮结束更新 `docs/loop/STATE.md`：当前轮号 / 队列指针 / 进行中问题 / 上一 commit hash；
- 任何新会话接手时，**第一动作**是读这两个文件恢复现场，禁止凭记忆重跑已完成轮次；
- 上下文若出现压缩摘要，以 STATE.md 与迭代记录为准，不以摘要里的旧结论为准。

## 5. 候选工作队列（按此顺序消费，够 ≥4h）

标注：**[P]** 纯前端可闭环（loop 主线）｜**[受限]** 需凭据/后端迁移（默认跳过，队列耗尽才在显式申报后做）。

### 主线 A：布局与 UI 风格（承接「当前分支再进一步」）

| # | 候选 | 入口/假设 | 预估 |
|---|---|---|---|
| A0 | **WIP 收口**（Iteration 000）：全门验证当前未提交改动并 commit | 工作区 5 文件待验收 | 1 轮 |
| A1 | 抽屉打开时 body 滚动未锁定，背景页面可滚 | 手测 375px 开抽屉滚背景 | 1 轮 |
| A2 | 统计仪表盘 4 指标卡在 375px 的换行/挤压；进度条百分比文字与条重叠风险 | `npm run test:viewport` + 自检截图 | 1–2 轮 |
| A3 | WordList 拾遗：宽屏卡片栅格利用率（现单列）；空态引导（无收藏时跳 AI/临境） | `renderWordList()` | 1 轮 |
| A4 | 暗色主题全页走查：抽屉/遮罩/新卡片在暗色下的边框与阴影（`.nav-backdrop`、`.wl-status-btn`、`.review-track` 均为新增未过暗色实测） | 自检截图 + token 核对 | 1–2 轮 |
| A5 | focus-visible 键盘可达性：顶栏按钮/抽屉项/卡片按钮的焦点环统一 | 走查 + contrast 门 | 1 轮 |
| A6 | 新增 CSS（`wl-*`、`review-progress`、`nav-backdrop`）内联样式迁移：`renderWordListCard` 里仍有内联 style，迁入 DesignSystem 类 | js/app.js | 1 轮 |

### 主线 B：功能逻辑升级

| # | 候选 | 入口/假设 | 预估 |
|---|---|---|---|
| B1 | 拾遗**复习提醒**（Phase 4.3 候选项）：打开页面时按 `korean_wordlist_review_log` 计算「今日未复习」→ 顶部提示条 + 可配置每日 N 条；纯本地实现 | docs Phase 4.3 候选 | 2 轮 |
| B2 | WordList **筛选/搜索**：按类型（词/句）× 状态（新/学习中/掌握）× 来源过滤；状态流转已有三态按钮，缺检索 | `renderWordList()` | 1–2 轮 |
| B3 | AI 练句历史管理：单条删除、全部清空（走 `bkConfirm` 确认框范式）、导出 JSON | `korean_ai_history` | 1 轮 |
| B4 | **AI 未配置禁用态走查**：`/ai/status` 不可用时，砥砺页/临境页所有 AI 入口应有统一禁用+提示（AGENTS 要求但未系统核对） | `tts_server.js` 无 key 启动实测 | 1 轮 |
| B5 | 断句训练断点续训：剥茧页刷新后回到上次进度位 | `korean_training_done` | 1–2 轮 |
| B6 | 快捷键帮助面板：已有 `按0/按7/按8` 提示散落各 title，聚合为 `?` 呼出的面板 | EntryShell | 1 轮 |

### 受限区 C（需凭据/迁移，默认跳过）

| # | 候选 | 阻塞点 |
|---|---|---|
| C1 | 拾遗复习日志跨设备同步 | 需 D1 加表 + 迁移 + 生产部署 |
| C2 | 生产 TTS KV/R2 缓存（Phase 4.5 候选） | 需 KV 绑定 + 生产验证 |
| C3 | 生产自检 `npm run test:selfcheck:prod` + `test:viewport`（E2E_BASE 指生产） | 需网络与生产稳定窗口 |

> 队列耗尽的处理：回到 Step 1 的四条问题来源重新扫描（自检/视口/审计/代码走查），产出新候选追加到本表（写明加入时间与轮次），禁止原地空转或重复做已完成项。

## 6. 标杆对照机制（每 10 轮，R5）

标杆文件：**`docs/loop/标杆.md`**（本项目的 RETEXT_标杆.md 等价物，内容为实测基线与范式清单）。

对照轮动作：
1. 逐节核对标杆文件的 **token 使用 / 布局范式 / 交互范式 / 代码范式 / 质量基线** 五节，输出偏差表（偏差点 · file:line · 判定：修正|豁免·理由）；
2. 判定「修正」的项合并为一个回归修正轮执行（走完整 Step1–5）；
3. 若项目合理演进导致标杆本身过时（如新增合法 token），更新标杆文件并在 commit 中单独说明「标杆修订」；
4. 对照结论追加到该轮迭代记录末尾。

## 7. 4 小时排程（弹性，轮长 15–25 min）

```
0:00–0:30   Iteration 000：WIP 收口（全门 + commit）          ← A0
0:30–2:00   迭代 001–004：主线 A（布局/暗色/可达性）
2:00–2:10   状态落盘检查点（STATE.md 核对 + git log 复盘）
2:10–3:40   迭代 005–009：主线 A 收尾 → 主线 B（B1 复习提醒优先）
3:40–4:00   第 10 轮标杆对照 + 回归修正 + 收尾 commit + STATE 终写
```

> 若某轮超时 25 min：按 R4 熔断或拆轮，不挤压后续排程。

## 8. 迭代记录模板（`docs/loop/iterations/NNN.md`）

```markdown
# Iteration NNN — <标题>
- 日期/耗时：
- 队列来源：A# | B# | 扫描发现
## Step1 问题与反问
（按 §2 Step1 格式，含代码证据）
## Step2 方案步骤
## Step3 验收标准
- 命令级：
- 断言级：
- 反例级：
## Step4 实施（diff 摘要 + 关键 file:line）
## Step5 验收结果（命令输出摘要，逐条断言 ✓/✗）
## 结论：PASS/FAIL/REVERT ｜ commit：<hash 或「未提交」>
## 遗留 → 追加到队列的候选
```

`STATE.md` 初始内容见该文件本体（随本方案一并创建）。

## 9. 启动指令（kick-off prompt，直接投喂 agent）

```
持续迭代本仓库，严格遵循 docs/loop/LOOP_PLAN.md：
1. 读 docs/loop/STATE.md 与最近 3 份 docs/loop/iterations/*.md 恢复现场（首次从 Iteration 000 开始）；
2. 从 docs/loop/LOOP_PLAN.md §5 队列取下一个未完成 [P] 候选，按 §2 SOP Step1–5 执行一轮；
3. 全程遵守 §3 Strict Rules 与 §4.2 硬禁区，验收命令以 §4.3 为准；
4. 每轮收尾写迭代记录并更新 STATE.md，满足 R2 才 commit，然后立即开始下一轮；
5. 累计第 10 轮执行 §6 标杆对照；队列耗尽或满 4 小时按 §7 收尾。
```
