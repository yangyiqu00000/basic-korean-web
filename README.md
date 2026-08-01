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
