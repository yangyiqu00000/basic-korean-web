# AGENTS.md — Basic Korean Web

韩语"最小可行学习系统"：7 大骨架规则、断句训练、核心词干、两周日课表、Edge TTS 语音、AI 智能练句 / AI 情景对话。**纯原生 HTML/CSS/JS，零框架、零构建步骤。**

## 目录结构
- `index.html` — 入口页，按顺序加载数据层合并脚本（`data_core.js`/`data_ext.js`）后加载 `js/app.js`；Vue 3 已本地化到 `js/vendor/vue.global.prod.js`（P0-1）
- `web_server.js` — 静态文件服务器（端口 **9999**，仅文件服务，无 API）
- `tts_server.js` — TTS + AI 代理服务器（端口 **1234**）
- `generate_audio.py` — 批量音频生成脚本（edge-tts）
- `ai_config.example.json` — AI 配置模板；`ai_config.json` 需自行创建（已被 gitignore）
- `css/style.css` — 全局样式 + 设计系统 + 动效（CSS 变量定义配色/字体）
- `js/data.js` `rules_data.js` `stems_data.js` `sentences_data.js` `reference_data.js` `word_mnemonics_data.js` — 数据层源文件（全局变量，无模块；**合并产物**见下）
- `js/data_core.js` `js/data_ext.js` — 数据层合并产物（P1-7 性能优化）：`data_core = data+rules+stems`，`data_ext = sentences+reference+word_mnemonics`。改数据源文件后重跑 `bash scripts/rebuild-data.sh` 再生成，勿手改合并产物
- `js/app.js` — 主应用逻辑（导航 `navigate()`、各页 `renderXxx()`、AI、TTS、色彩系统、拾遗收藏本、入场动效 `retriggerPageEnter()`）
- `js/sync.js` — 云同步层（登录态、blob 拉取合并/推送、收藏与场景记录级 CRUD、墓碑删除）。须在 `app.js` 之后加载
- `js/vue-app.js` — Vue 3 入口：注册组件 + 接管路由。组件只是「Vue 容器 + 原始渲染」薄壳，见下条
- `js/components/*.js` — Vue 页面组件。**只是薄壳**：每个组件用 `v-html` 转发老式全局 `renderXxx()`，Vue 只负责路由与 `:key` 重建，没有真正组件化。新增页面需同时改 `js/vue-app.js` 的路由表 + `index.html` 的 script 列表 + `css/style.css` 的 `.*-page-vue` 容器选择器
- `functions/api/*` — Cloudflare Pages Functions 后端（D1 + PBKDF2 认证 + 同步 + 统计 + 邮箱验证）
- `functions/ai/*`、`functions/tts/` — 生产侧 AI 代理与 TTS 四级回退
- `schema.sql` — D1 建表语句 ｜ `wrangler.toml` — Pages + D1 绑定配置（**生产环境须重复声明绑定**，Pages 不继承顶层）
- `tests/e2e/` — E2E 与双设备同步回归 ｜ `scripts/` — 部署、数据重建、三项审计
- `sw.js` — Service Worker（network-first，只缓存带 `?v=` 的静态资源，HTML/API/TTS 永不缓存）
- `audio/` — TTS 音频缓存（md5(text).mp3，gitignore，勿提交）
- `assets/` — 静态资源

## 命令
- 启动全部：`bash start.sh`（= `npm start`）。会自动检查/安装 edge-tts、启动两个服务器、打开浏览器。访问 http://localhost:9999
- 仅网页：`node web_server.js` ｜ 仅 TTS+AI：`node tts_server.js`
- Python 依赖：`pip3 install edge-tts>=7.2`（系统级 CLI，非 npm 包）

### 质量门（CI 与本地通用，改完务必跑一遍）
- `npm run audit:strict` —— Vue 冲突静态审计（#vue-root/#mainContent 未防护写入、同页 navigate）
- `npm run audit:assets:strict` —— 资产完整性：index.html 引用的本地文件必须存在 + `js/components/` 无孤儿文件
- `npm run audit:contrast` —— 设计系统色彩对比度（WCAG AA 4.5:1），解析 CSS 变量校验亮暗两主题
- `npm run test:e2e:ci` —— 便携式 E2E（导航/动效/筛选/pageTick 机制）。本地免下载浏览器：`PW_CHANNEL=chrome npm run test:e2e:ci`
- `npm run test:viewport` —— 响应式断点（375/480/600/769）。测生产：`E2E_BASE=https://xxx.pages.dev npm run test:viewport`
- `bash tests/e2e/dual-device-ci.sh` —— 双设备云同步回归（需 CF 凭据）
- 无 typecheck / 无 lint（项目仅用 Node 内置模块，无 TS）。

> 三道门（asset / contrast / viewport）都是为了防「肉眼看不出、实测有问题」的事故复发而加的，详见各自脚本头部注释。新增主色系 token 或改动配色后，记得同步更新 `scripts/contrast-audit.js` 里的 CONTRACTS。

## 架构边界（改动前必读）
- **前端是全局脚本，不是 ES 模块。** `index.html` 按固定顺序加载：`data_core.js` → `data_ext.js` → app.js（P1-7 合并后）。**顺序敏感**（后面的脚本依赖前面定义的全局变量）。新增数据文件必须在合并脚本 `scripts/rebuild-data.sh` 与 `index.html` 中按依赖顺序处理，**不要**加 `type="module"`、不要写 `import/export`，否则会破坏加载。
- **两个独立 Node 进程**，不共享状态：web_server 只发静态文件；tts_server 提供 `/tts`、`/ai`、`/ai/chat`、`/ai/status`、`/health` 接口。改动接口时确认改的是 tts_server。
- **AI Key 只在服务端**：`ai_config.json` 的 key 经 tts_server 代理转发，**永不可**出现在前端 JS 里。浏览器只请求 `localhost:1234`。
- **TTS 走 Python CLI**：`tts_server.js` 用 `child_process.execFile('edge-tts', …)` 调用系统二进制，语音固定 `ko-KR-SunHiNeural`，音频按 `md5(text).mp3` 缓存到 `audio/`。TTS 并发上限为 3（`MAX_TTS_CONCURRENCY`），并对相同文本去重。服务仅绑定 `127.0.0.1`（仅本地访问）。

## 编码约定
- **词性色彩系统**：`js/app.js` 顶部 `ELEM_COLORS` + `getElemClass()` 定义 7 种词性 → CSS class 映射（词干/助词/终结词尾/连接词尾/时态词尾/否定/语气），必须与 `css/style.css` 中 `elem-*` class 保持一致。**注意两套解析**：骨架/词干页用 `getElemClassFromMeaning`（breakdown 是 `[text, meaning]` 数组），AI 页用 `getElemClass`（breakdown 是 `{part, tag, meaning, label}` 对象）。勿混用。两套函数的判断逻辑和参数结构不同，修改任一函数的分类规则时需同步更新另一函数，否则相同词性在不同页面会显示不同颜色。
- **AI 输出契约**：`tts_server.js` 的 prompt 要求模型只返回严格 JSON（`kr/full/breakdown[rules]/tip/examples`），服务端会剥离可能的 markdown 代码块包裹。改 AI 输出结构时，需同时更新 prompt 与 `app.js` 的 `renderAIResult` / 情景对话渲染。
- **7 大骨架规则**编号为 ①②③④⑤⑥⑦；AI 返回的 `rules` 字段引用这些数字，`tts_server.js` 中的 prompt 有完整定义。
- **敬语规范**：AI 始终用 `-요` 体（命令用 `-세요`），prompt 中已锁定。
- **持久化：LocalStorage + Cloudflare D1 双层。** 本地键：学习进度 `korean_progress`、断句训练"已掌握" `korean_training_done`、AI 练句历史 `korean_ai_history`、自定义情景 `korean_custom_scenes`、情景对话历史 `korean_scene_history`、收藏本 `korean_collections`。
  - 后端是 **Cloudflare D1**（`basic-korean-db`），经 `functions/api/*` 提供注册/登录/同步/统计；前端同步层在 `js/sync.js`（方案 C：整包同步 + 智能合并 + 删除墓碑）。
  - 情景对话的"场景"由用户自定义存于 localStorage 并同步上云，**不是**数据文件。
  - 完整后端设计与 Phase 状态见 `docs/design/v2-upgrade-plan.md`。

## 已知坑点
- **`index.html` 的 `?v=` 版本戳**：改了 `js/`、`css/` 下任何文件后必须同步 bump（当前 `?v=20260830a`）。Service Worker 只对带 `?v=` 的 URL 做缓存，戳不变则旧缓存 URL 命中。
  - 缓解：`sw.js` 已改为 **network-first**（在线永远取最新，缓存仅离线兜底），所以忘记 bump 不再导致用户拿到旧代码。但 bump 仍是好习惯，能让 CDN 也正确失效。
- **主色 token 三分，勿混用**：`--primary`（填充/背景）、`--on-primary`（压在其上的前景色）、`--primary-ink`（主色系文字，落浅底）。`--accent` **只能用于边框/装饰**，作文字色只有 2.37:1。写错会被 `npm run audit:contrast` 拦下。
- **入场动效必须挂在 `.main` 上**：统一调 `retriggerPageEnter()`，不要手写 `classList.add("page-enter")`。CSS 选择器是 `.main.page-enter ...`，挂到 `.xxx-page-vue` 组件根节点上不生效（历史上踩过三次）。
- `audio/*.mp3`、`audio/*.json`、`ai_config.json` 已被 gitignore——音频和密钥均不提交。
- **静态服务器已做安全防护**：`web_server.js` 会拦截 `ai_config.json`、所有点文件（`.git`/`.env` 等）以及路径穿越（realpath 包含校验），返回 403。不要在静态目录下放置需保密的文件，也不要在此放开这些拦截。
- **AI 返回内容已 HTML 转义**：所有 AI 拆解/对话字段渲染都经 `escapeHtml()`（app.js 内已有）处理。新增任何渲染 AI 字段（`b.part/b.label/b.meaning`、`data.kr/data.full/data.tip`、`ex.*`）的代码，务必用 `escapeHtml()` 包裹，避免 XSS。
- `start.sh` 用 macOS `open` / Linux `xdg-open` 打开浏览器；无 GUI 环境会跳过。
- 端口冲突：改 `web_server.js` 中 `PORT=9999` 或 `tts_server.js` 中 `PORT=1234` 常量；tts 服务现绑定 `127.0.0.1`，如需跨机访问改 `server.listen` 的绑定地址。
- TTS 依赖系统安装的 `edge-tts`；若缺失，TTS 报错但 AI 功能（若已配置 key）仍可用。
- 字体来自 Google Fonts（Plus Jakarta Sans / Noto Sans KR / Noto Sans SC），需联网；离线时字体回退。
- AI 未配置 `ai_config.json` 时，其余功能正常，仅 `/ai`、`/ai/chat` 不可用（前端应据此禁用相关 UI）。
- `generate_audio.py` 不再改写 `app.js` 源码（历史上它会把播放逻辑改成读本地 `audio_map.json`，有副作用）；现仅生成音频与 `audio_map.json` 作为可选离线缓存，播放仍走 TTS 服务器。
- **同步层静默错误**：`js/sync.js` 中的 `apiFetch` 调用在失败时仅 `console.warn` 而非弹 Toast，避免频繁打断用户。调试同步问题时请打开浏览器 DevTools Console 查看 `[sync]` 前缀日志。
