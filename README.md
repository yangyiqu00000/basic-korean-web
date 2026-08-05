# 🇰🇷 Basic Korean Web

韩语最小可行学习系统 —— 用"最小可行系统"启动韩语学习，两周内拥有完整的韩语语法地图。

## ✨ 功能

- **🏗️ 7 大骨架规则** — 韩语语法的承重墙：主宾谓、助词、时态、敬语、连接、否定、语气
- **🃏 断句训练** — 43 句逐词拆解，每词标注词性色块 + 骨架规则编号；支持已掌握进度追踪、未掌握筛选、随机抽句练习、未掌握优先排序
- **📝 核心词干** — 84 个最常用动词/形容词词干，支持实时搜索过滤
- **🗓️ 两周日课表** — 每天 20 分钟，进度持久化到本地，含可视化进度条
- **🏷️ 标签速查表** — 助词、词尾、疑问词一览，支持实时搜索过滤
- **🔊 Edge TTS 语音** — 微软 Edge TTS 韩语语音，支持女声/男声/多语言切换；自动缓存；断句展开自动朗读
- **🤖 AI 智能练句** — 输入任意中文，AI 自动翻译并按学习体系拆解词性、助词、词尾、标注骨架规则；结果可一键复制韩语、自动朗读
- **💬 AI 情景对话** — 选择场景与 AI 韩语对话，自动拆解每句词性；复习模式支持标记重点句、重练、导出对话记录
- **🎨 暗色/亮色主题** — 支持系统偏好跟随或手动切换，持久化到本地
- **⌨️ 全局快捷键** — 数字键 1-8 快速切换页面
- **📊 学习统计** — 学习进度总览、数据管理（重置/导出/备份）
- **📱 PWA 支持** — 可安装为应用（manifest.json）；离线缓存已停用（Service Worker 不再注册，避免缓存干扰开发）
- **🎉 成就感反馈** — 全部断句完成庆祝、掌握进度可视化

## 📋 环境要求

| 依赖 | 最低版本 | 用途 |
|------|---------|------|
| [Node.js](https://nodejs.org/) | ≥ 14 | Web 服务器 + TTS 代理 + AI 代理 |
| [Python 3](https://www.python.org/) | ≥ 3.8 | edge-tts 语音合成 |
| [edge-tts](https://pypi.org/project/edge-tts/) | ≥ 7.2 | 微软 Edge TTS CLI 工具 |

> 不需要安装 npm 包，项目仅使用 Node.js 内置模块。

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/yangyiqu00000/basic-korean-web.git
cd basic-korean-web
```

### 2. 安装依赖

```bash
# 安装 Python edge-tts（用于韩语语音合成）
pip3 install edge-tts

# 确认 Node.js 已安装
node --version   # 应输出 v14 或更高
```

### 3. 配置 AI 功能（可选）

AI 智能练句功能需要配置 API Key。复制模板并填写你的配置：

```bash
cp ai_config.example.json ai_config.json
```

编辑 `ai_config.json`，填入你的 API 信息：

```json
{
  "api_base": "https://api.openai.com/v1",
  "api_key": "sk-你的API Key",
  "model": "gpt-4o-mini"
}
```

> 支持任何 OpenAI 兼容接口（OpenAI / DeepSeek / Moonshot / 本地 Ollama 等）。
>
> 如果不配置，其余功能（骨架规则、断句训练、词干、日课表等）正常使用，仅 AI 练句不可用。

### 4. 一键启动

```bash
bash start.sh
```

脚本会自动：
1. 检查并安装 edge-tts（如果未安装）
2. 启动 TTS + AI 服务（端口 1234）
3. 启动 Web 服务（端口 9999）
4. 打开浏览器

启动后访问 http://localhost:9999 即可开始学习。

## 🌐 生产部署（Cloudflare Pages）

项目部署在 Cloudflare Pages，`scripts/deploy-prod.sh` 一键完成「检测 → 部署 → 验证」全流程，内置验证矩阵兜底，避免再次踩「部署到 Preview、Secrets 不生效」的坑。

### 前置条件

- 本地已装 `wrangler`（devDependencies，`npm install` 即可）
- 已设置 `CLOUDFLARE_API_TOKEN` 环境变量（或 `CLOUDFLARE_API_KEY`）；**两者皆缺时自动回退本机 wrangler OAuth 登录**（先 `npx wrangler login` 一次），无需额外配置

### 用法

```bash
# 标准流程：自动检测生产分支 → 部署到生产 → 跑验证矩阵
bash scripts/deploy-prod.sh

# 验证自定义域名（不测默认的 *.pages.dev）
DEPLOY_URL=https://your.domain bash scripts/deploy-prod.sh

# 只跑验证矩阵，线上复查不部署（无需凭据）
SKIP_DEPLOY=1 bash scripts/deploy-prod.sh

# 覆盖部署分支（默认自动检测 = CI 同款 main，不推荐改）
BRANCH=my-branch bash scripts/deploy-prod.sh
```

生产分支**自动检测**：优先从 `.github/workflows/deploy.yml` 提取 deploy 步骤的 `--branch`（现为 `main`）与 `--project-name`、`accountId`；workflow 缺失时兜底 `git origin/HEAD` → `main`。

### ⚠️ 为什么必须带 `--branch`（Preview 无 Secrets 的坑）

Cloudflare Pages 的 Secrets（`AI_API_KEY` / `EDGE_TTS_ENABLED` 等）**只挂在生产环境**。不带 `--branch` 部署时，wrangler 默认用当前 git 分支 → 部署落到 **Preview 环境**：

- `/ai/status` 返回 `configured:false`，AI 功能不可用
- `/tts` 走不到 Edge 免费回退，直接 503，浏览器降级为 Web Speech API
- 表现是「在线但功能缺失」，且 Preview 与正式域名分离（`<hash>.basic-korean.pages.dev`），极难察觉

本脚本强制 `wrangler pages deploy . --branch main`，确保命中生产 Secrets。

### ✅ 验证矩阵判定标准

部署完成后脚本对线上依次检查 5 项，全部 PASS 才退出码 0：

| # | 检查项 | 判定标准 | 失败含义 |
|---|--------|---------|---------|
| ① | 首页可达 | HTTP 200（最多 30 次 × 3s 重试等 CDN 传播） | 部署失败 / CDN 未传播 |
| ② | 首页无 unpkg | 首页 HTML 不含 `unpkg.com` 引用 | Vue 本地化回退 CDN（页面会拉公共 CDN，离线/性能受损） |
| ③ | 版本戳一致 | 线上首页 `?v=` 戳 = 本地 `index.html` 的 `?v=` 戳 | 命中旧 CDN 缓存 / 部署错目录 / 未部署到最新 |
| ④ | AI Secrets 生效 | `/ai/status` 重试至 200 且 JSON 含 `"configured": true` | **部署到 Preview 空环境 / Secrets 缺失**（Secrets 生效的权威证据） |
| ⑤ | TTS 链路可用 | `/tts?text=…` 返回 200 且 `Content-Type: audio/mpeg`（最多 5 次 × 45s，首次冷启动慢） | `EDGE_TTS_ENABLED` 未生效 / Edge 端点故障（非 503 浏览器降级） |

> 首页不可达（①失败）时，②③ 会跳过内容断言而非误报 PASS；仅 ④/⑤ 独立于首页继续。验证失败会打印 FAIL 项并退出码 1，常见原因：Preview 空环境、CDN 缓存未刷新、Secrets 缺失。

## 📖 使用指南

### 学习顺序

1. **骨架规则** — 先建立语法地图感，知道韩语有哪 7 个核心部件
2. **断句训练** — 每天看 3-5 句，尝试自己断句再点开看拆解
3. **核心词干** — 每天背 10 个，配合例句记忆
4. **日课表** — 按计划执行，每天 20 分钟
5. **AI 练句** — 随时输入任意中文，AI 按你的学习体系拆解教学

### 色彩系统

每个韩语词在拆解中都用色块标注了词性：

| 色块 | 词性 | 示例 |
|------|------|------|
| 🟤 棕色 | 词干/词根 | 저(我)、커피(咖啡) |
| 🔴 红色 | 助词 | 는(主题)、를(宾语) |
| 🟠 橙色 | 终结词尾 | -요、-습니다 |
| 🟢 绿色 | 连接词尾 | -고、-서、-지만、-면 |
| 🟡 黄色 | 时态词尾 | -았/었、-을 거예요 |
| 🟣 紫色 | 否定 | 안、못 |
| 🔵 青色 | 语气 | -세요、-을까요、-죠? |

## 🏗️ 项目结构

```
basic-korean-web/
├── index.html              # 入口页面
├── manifest.json           # PWA 清单（可安装为应用）
├── start.sh                # 一键启动脚本
├── web_server.js           # 静态文件服务器 (端口 9999，支持安全拦截)
├── tts_server.js           # TTS + AI 代理服务器 (端口 1234，支持多语音)
├── generate_audio.py       # 批量音频生成脚本
├── ai_config.example.json  # AI 配置模板
├── ai_config.json          # AI 配置（需自行创建，已被 gitignore）
├── requirements.txt        # Python 依赖
├── package.json            # Node.js 项目信息
├── AGENTS.md               # 工作区指令（ZCode agent 使用）
├── scripts/
│   ├── deploy-prod.sh          # 一键部署到 Cloudflare Pages 生产 + 验证矩阵
│   ├── rebuild-data.sh         # 重新合并数据层（data_core.js / data_ext.js）
│   ├── audit-vue-conflicts.js  # 审计 Vue 全局变量冲突
│   ├── test-tolerant-parse.js  # AI 容错 JSON 解析单测（17 用例，加载 tts_server.js 真实函数）
│   └── tts-server.launchd.plist # macOS launchd 常驻 tts_server（可选，含本机路径需按环境调整）
├── css/
│   └── style.css           # 全局样式 + 设计系统 + 动效 + 暗色主题
├── js/
│   ├── app.js              # 主应用逻辑（导航、渲染、AI、TTS、统计、主题…）
│   ├── data.js             # 基础数据
│   ├── rules_data.js       # 7大骨架规则数据
│   ├── sentences_data.js   # 43条断句训练数据
│   ├── stems_data.js       # 84个核心词干数据
│   └── reference_data.js   # 助词/词尾/疑问词速查表
├── audio/                  # TTS音频缓存（自动生成，gitignore）
└── assets/                 # 静态资源（含 PWA 图标 SVG）
```

## ⚙️ 技术栈

- **前端**：原生 HTML/CSS/JS，零框架，零构建步骤
- **语音**：[edge-tts](https://pypi.org/project/edge-tts/)（微软 Edge TTS，免费）
- **AI**：OpenAI 兼容 API（Chat Completions 接口）
- **字体**：Google Fonts — Plus Jakarta Sans + Noto Sans KR + Noto Sans SC
- **持久化**：LocalStorage（学习进度 + AI 练句历史）

## 🔒 安全说明

- `ai_config.json` 已被 `.gitignore` 排除，API Key 不会提交到 GitHub
- AI 请求通过本地 `tts_server.js` 代理转发，API Key 不暴露给浏览器前端
- 静态服务器 `web_server.js` 已拦截 `ai_config.json`、点文件（`.git`/`.env` 等）及路径穿越攻击，返回 403
- 所有数据存储在本地，不上传任何用户信息

## 📝 License

MIT
