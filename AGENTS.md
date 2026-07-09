# AGENTS.md — Basic Korean Web

韩语"最小可行学习系统"：7 大骨架规则、断句训练、核心词干、两周日课表、Edge TTS 语音、AI 智能练句 / AI 情景对话。**纯原生 HTML/CSS/JS，零框架、零构建步骤。**

## 目录结构
- `index.html` — 入口页，按顺序加载数据层脚本后加载 `js/app.js`
- `web_server.js` — 静态文件服务器（端口 **9999**，仅文件服务，无 API）
- `tts_server.js` — TTS + AI 代理服务器（端口 **1234**）
- `generate_audio.py` — 批量音频生成脚本（edge-tts）
- `ai_config.example.json` — AI 配置模板；`ai_config.json` 需自行创建（已被 gitignore）
- `css/style.css` — 全局样式 + 设计系统 + 动效（CSS 变量定义配色/字体）
- `js/data.js` `rules_data.js` `stems_data.js` `sentences_data.js` `reference_data.js` — 数据层（全局变量，无模块）
- `js/app.js` — 主应用逻辑（导航 `navigate()`、各页 `renderXxx()`、AI、TTS、色彩系统）
- `audio/` — TTS 音频缓存（md5(text).mp3，gitignore，勿提交）
- `assets/` — 静态资源

## 命令
- 启动全部：`bash start.sh`（= `npm start`）。会自动检查/安装 edge-tts、启动两个服务器、打开浏览器。访问 http://localhost:9999
- 仅网页：`node web_server.js` ｜ 仅 TTS+AI：`node tts_server.js`
- Python 依赖：`pip3 install edge-tts>=7.2`（系统级 CLI，非 npm 包）
- **无测试、无 typecheck、无 lint**（项目仅用 Node 内置模块）。验证靠启动服务器后在浏览器加载。

## 架构边界（改动前必读）
- **前端是全局脚本，不是 ES 模块。** `index.html` 按固定顺序加载：data.js → rules_data.js → stems_data.js → sentences_data.js → reference_data.js → app.js。**顺序敏感**（后面的脚本依赖前面定义的全局变量）。新增数据文件必须在 `index.html` 中按依赖顺序追加 `<script>`，**不要**加 `type="module"`、不要写 `import/export`，否则会破坏加载。
- **两个独立 Node 进程**，不共享状态：web_server 只发静态文件；tts_server 提供 `/tts`、`/ai`、`/ai/chat`、`/ai/status`、`/health` 接口。改动接口时确认改的是 tts_server。
- **AI Key 只在服务端**：`ai_config.json` 的 key 经 tts_server 代理转发，**永不可**出现在前端 JS 里。浏览器只请求 `localhost:1234`。
- **TTS 走 Python CLI**：`tts_server.js` 用 `child_process.execFile('edge-tts', …)` 调用系统二进制，语音固定 `ko-KR-SunHiNeural`，音频按 `md5(text).mp3` 缓存到 `audio/`。TTS 并发上限为 3（`MAX_TTS_CONCURRENCY`），并对相同文本去重。服务仅绑定 `127.0.0.1`（仅本地访问）。

## 编码约定
- **词性色彩系统**：`js/app.js` 顶部 `ELEM_COLORS` + `getElemClass()` 定义 7 种词性 → CSS class 映射（词干/助词/终结词尾/连接词尾/时态词尾/否定/语气），必须与 `css/style.css` 中 `elem-*` class 保持一致。**注意两套解析**：骨架/词干页用 `getElemClassFromMeaning`（breakdown 是 `[text, meaning]` 数组），AI 页用 `getElemClass`（breakdown 是 `{part, tag, meaning, label}` 对象）。勿混用。
- **AI 输出契约**：`tts_server.js` 的 prompt 要求模型只返回严格 JSON（`kr/full/breakdown[rules]/tip/examples`），服务端会剥离可能的 markdown 代码块包裹。改 AI 输出结构时，需同时更新 prompt 与 `app.js` 的 `renderAIResult` / 情景对话渲染。
- **7 大骨架规则**编号为 ①②③④⑤⑥⑦；AI 返回的 `rules` 字段引用这些数字，`tts_server.js` 中的 prompt 有完整定义。
- **敬语规范**：AI 始终用 `-요` 体（命令用 `-세요`），prompt 中已锁定。
- **持久化**：LocalStorage（学习进度、AI 练句历史、自定义情景 `korean_custom_scenes`）。无后端数据库。情景对话的"场景"由用户自定义存于 localStorage，**不是**数据文件。

## 已知坑点
- `audio/*.mp3`、`audio/*.json`、`ai_config.json` 已被 gitignore——音频和密钥均不提交。
- **静态服务器已做安全防护**：`web_server.js` 会拦截 `ai_config.json`、所有点文件（`.git`/`.env` 等）以及路径穿越（realpath 包含校验），返回 403。不要在静态目录下放置需保密的文件，也不要在此放开这些拦截。
- **AI 返回内容已 HTML 转义**：所有 AI 拆解/对话字段渲染都经 `escapeHtml()`（app.js 内已有）处理。新增任何渲染 AI 字段（`b.part/b.label/b.meaning`、`data.kr/data.full/data.tip`、`ex.*`）的代码，务必用 `escapeHtml()` 包裹，避免 XSS。
- `start.sh` 用 macOS `open` / Linux `xdg-open` 打开浏览器；无 GUI 环境会跳过。
- 端口冲突：改 `web_server.js` 中 `PORT=9999` 或 `tts_server.js` 中 `PORT=1234` 常量；tts 服务现绑定 `127.0.0.1`，如需跨机访问改 `server.listen` 的绑定地址。
- TTS 依赖系统安装的 `edge-tts`；若缺失，TTS 报错但 AI 功能（若已配置 key）仍可用。
- 字体来自 Google Fonts（Plus Jakarta Sans / Noto Sans KR / Noto Sans SC），需联网；离线时字体回退。
- AI 未配置 `ai_config.json` 时，其余功能正常，仅 `/ai`、`/ai/chat` 不可用（前端应据此禁用相关 UI）。
- `generate_audio.py` 不再改写 `app.js` 源码（历史上它会把播放逻辑改成读本地 `audio_map.json`，有副作用）；现仅生成音频与 `audio_map.json` 作为可选离线缓存，播放仍走 TTS 服务器。
