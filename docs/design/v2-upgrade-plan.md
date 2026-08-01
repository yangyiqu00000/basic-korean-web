# Basic Korean V2 升级设计文档：内容重构 + 云端同步

> 状态：实施记录 v0.4（Phase 1–3 已完成并上线）｜ 日期：2026-08-01
> 决策基线（用户已确认）：
> - 登录：D1 自建「邮箱+密码」（**PBKDF2** 哈希，Web Crypto，见 §3.3）+ **邮箱验证（Resend，§3.7）**，开放注册，后续可叠加 OAuth 快捷登录
> - 同步：方案 C（整包同步 + 智能合并），**含删除/清空的墓碑机制**；scenes / messages 已于 Phase 3 迁为记录级（§3.6），collections 自 Phase 2 起记录级
> - 规模：当前 demo ≤100 人，但架构须可扩展至学生/更广泛群体
> - 词句表：用户收藏的词与句，绑定用户状态，用于学后查漏补缺
> - ✅ 已拍板：「时宜」= 一位用户（§5 问题 1）；筑基 Tab 默认「句的助记」（§5 问题 2）

---

## 0. 用户核心诉求（原文逻辑，逐条落实）

1. **词句表定位**：用户收藏的词和句，必须与用户状态绑定（登录后云端保存、跨设备一致）。
2. **时宜功能**：用于学习后查漏补缺，通过收藏内容进行复习。
3. **基础内容迁移**：当前散落在 AI 对话/交互中的「助词、词尾、疑问句」等词的基础知识，应移至「筑基」环节。
4. **筑基规则调整**：筑基拆为两部分——现有语法规则保留为「句的助记」；新增「词的助记」模块（涵盖助词、词尾等），与「句的助记」区分。
5. **词句表展示**：用户在前置环节学习时均可收藏；收藏后按「词」和「句」分开展示，正确反映来源与状态。

---

## 1. 内容位置调整方案

### 1.1 现状盘点（全部内容资产）

| 模块 | 数据文件 | 内容 | 定位 |
|---|---|---|---|
| 筑基 | `js/rules_data.js` | `RULES` 7 条骨架规则 | **句的助记**（句尾/助词系统/时态/敬语/连接/否定/疑问命令） |
| 拾遗 | `js/reference_data.js` | `REFERENCE.particles`(12) / `.endings`(20) / `.questionWords`(8) | 标签速查表（含大量**词级知识**：助词、词尾、疑问词） |
| 剥茧 | `js/stems_data.js` | `STEMS.verbs`(52) + `.adjectives`(32) | 词干学习 |
| 抽丝 | `js/sentences_data.js` | 43 句断句训练 | 句子级训练 |
| 砥砺 | AI 接口 | 逐词拆解（含助词/词尾标签） | AI 练句 |
| 临境 | AI 接口 + `korean_custom_scenes` / `korean_scene_history` | 场景对话 | AI 情景对话 |
| 润物 | `js/data.js` | 14 天日课表 | 日程 |

**问题**：助词、词尾、疑问词这些**词的基础知识**目前主要躺在「拾遗」速查表里（被动查找），AI 对话中零散出现，**没有进入主动学习的主线**——这正是用户要迁移到筑基的原因。

### 1.2 调整方案

**筑基 = 句的助记 + 词的助记（两个子模块）**

```
筑基（导航改名为「筑基」）
├── ① 句的助记（Tab 1，默认）── 现有 RULES 7 条，原样保留
│    编号 ①②③④⑤⑥⑦ 不变（AI prompt 引用规则编号，不能动）
└── ② 词的助记（Tab 2，新增）── 从 REFERENCE 迁入的词级知识
      ├── 助词表（12 项，含角色/含义/例句/优先级）
      ├── 词尾表（20 项，含类型/含义/例句/优先级）
      └── 疑问词表（8 项）
```

**迁移动作**：
- 新增 `js/word_mnemonics_data.js`（数据源直接复制 `REFERENCE` 三个数组，可后续扩展 teaching 字段如"记忆口诀"）
- 筑基页 `renderSkeleton()` 增加 Tab 切换（句的助记 / 词的助记），词的助记复用拾遗的表格渲染样式（`renderReference` 的表格模板抽成公共函数）
- **拾遗保留**：作为速查表继续存在（两处共用同一数据源，不重复维护——词的助记数据文件与 REFERENCE 数据文件可保持引用或合并为一个源）
- **交叉引用（v0.2 评审修订）**：句的助记 rule ②「助词系统」与新「词的助记·助词表」内容重叠——在两处互相加引用（rule 教用法，表教全量清单），避免学习者困惑
- AI 输出契约不变（`rules` 字段仍引用 ①②③④⑤⑥⑦）；如需 AI 也引用词的助记，后续在 prompt 中追加"词级编号"（如 ⑧ 助词/⑨ 词尾），**不在本次范围**

**数据归属**：`REFERENCE` 三个数组是静态内容（非用户数据），不进后端；后端只同步用户状态。

---

## 2. 新建内容设计：词句表（收藏本）

### 2.1 定位

- **收藏即复习**：用户在任意学习环节（筑基/抽丝/剥茧/砥砺/临境/拾遗）点击「收藏」，进入个人词句表
- 与用户状态绑定：登录用户专属，跨设备同步；未登录时仅存本地（登录后自动合并）
- 分类展示：**词**（助词/词尾/词干/疑问词等）与**句**（例句/对话）分开两个 Tab

### 2.2 数据模型（记录级，直接建表）

```js
// 一条收藏记录
{
  id: "c_<uuid>",            // 全局唯一（本地生成，后端存储）
  userId: "u_<id>",          // 归属用户（未登录 = 本地草稿）
  type: "word" | "sentence", // 词 / 句
  text: "은/는",              // 收藏的原文（词或句）
  meaning: "主题标记",         // 含义/翻译
  source: "skeleton" | "training" | "stems" | "ai" | "scene" | "reference" | "manual",
  sourceRef: "rule-2" | "stem-12" | "sentence-5" | "ai:xxx" | "scene:xxx", // 来源引用（可选）
  status: "new" | "learning" | "mastered",  // 复习状态
  note: "",                  // 用户备注（可选）
  createdAt: 1710000000000,
  updatedAt: 1710000000000
}
```

### 2.3 收藏入口（全环节埋点）

| 环节 | 收藏目标 | 交互 |
|---|---|---|
| 筑基·词的助记 | 单个助词/词尾/疑问词 | 表格行尾「⭐ 收藏」按钮 |
| 剥茧 | 单个词干 | 词干卡片「收藏」按钮 |
| 抽丝 | 整句 + 该句拆解 | 句子卡片「收藏此句」 |
| 砥砺 AI 结果 | 整句 / 单个 breakdown 项 | 结果区「收藏」/ 词性块「收藏」 |
| 临境对话 | AI 消息中的句子 | 消息气泡「收藏」 |
| 拾遗 | 表格行 | 行尾「⭐ 收藏」 |

### 2.4 词句表页面（新增导航「词句表」）

- **Tab「词」**：按来源分组（助词/词尾/词干/疑问词），卡片展示 `text + meaning + 来源徽标`
- **Tab「句」**：按来源分组（抽丝/砥砺/临境/手动），卡片展示 `句子 + 翻译 + 来源徽标`
- **去重（v0.2 评审修订）**：同一 `type + text` 重复收藏时，UI 合并为一条（保留最早来源、最新备注/状态），`POST /api/collections` upsert 按 `user_id + type + text` 幂等；服务端同加唯一索引兜底
- **复习模式**：点击进入抽认卡（正面词/句，翻面含义），支持标记 `learning / mastered` 状态流转；按 `status` 过滤（新收藏/学习中/已掌握）
- **操作**：删除、编辑备注、导出（复用现有 backup 导出机制）

---

## 3. 后端设计方案

### 3.1 数据库选型：Cloudflare D1（SQLite）+ 限额结论

**回答用户两个问题：**

**Q1：数据库的极限在哪里？**

| 维度 | 免费版 | 付费版（$5/月起） |
|---|---|---|
| 单库存储 | 500 MB | 10–100 GB |
| 行读取 | 500 万行/天 | 含基础额度，超出按量付费（~$0.001/百万行） |
| 行写入 | 10 万行/天 | 含基础额度，超出按量付费（~$1.00/百万行） |
| 数据库数量 | 约 10 个 | 数百+ |
| 单字段值 | TEXT/BLOB 建议 ≤1–5 MB（SQLite 理论 1GB，但受 Worker 内存/请求体限制） | 同左 |

**对当前规模（≤100 用户 demo）的结论：免费版绰绰有余。**
粗算：100 用户 × 每人每天 200 次读写 = 2 万行/天，远低于 10 万写入上限；100 人 × 每人 1MB 数据 = 100MB，低于 500MB。**未来扩展到数千学生**：付费版 10GB 存储 + 100M 读/天依然够；若单库不够，可多库分片或按需升配。
> ⚠️ 以上为社区/官方口径综合值，**实施时以 `wrangler d1 info` 与官方定价页实测为准**（免费存储历史上在 500MB–5GB 表述间有过出入）。

**Q2：还能不能支撑"以后还不知道是什么类型"的数据？有更好的通用架构吗？**

能。D1 的通用性来自两点：
1. **SQLite JSON 能力**：`json_extract()` / Generated Columns 可对 JSON 字段做条件查询与索引，结构化程度可逐步加深；
2. **通用 blob 表兜底**：设计一张 `user_blobs(key, data_json, updated_at)` 表，**任何未知类型的新数据先以 JSON 整体入 blob 表**，等明确了查询需求再升级为专门表。这与前端方案 C（整包同步+智能合并）完全同构。

**推荐通用架构（分层）**：
```
R2（对象存储）── 音频/大文件，D1 只存元数据+指针
D1（SQLite）  ── 结构化表（users/sessions/scenes/collections）+ 通用 user_blobs 兜底
KV           ── 会话 token / 临时状态（可选，session 也可直接放 D1）
```
原则：**内容数据（词/句/规则）在静态 JS 文件，不进后端；用户数据进 D1；二进制进 R2**。

### 3.2 D1 Schema（初版，含预留）

```sql
-- 用户
CREATE TABLE users (
  id         TEXT PRIMARY KEY,          -- u_<uuid>
  email      TEXT UNIQUE NOT NULL,
  pass_hash  TEXT NOT NULL,             -- PBKDF2(password, salt, 100k iters)
  salt       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 会话（登录态）
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,          -- sha256(token)，不存明文
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- 通用同步表（方案 C 的核心：4 个 blob key（Phase 3 起）+ 未来未知类型兜底）
CREATE TABLE user_blobs (
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,             -- progress / training_done / ai_history / dismissed_tips（custom_scenes / scene_history 已迁出，见 §3.6）
  data_json  TEXT NOT NULL,             -- 整包 JSON（方案 C）
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- 临境场景（记录级，Phase 3 已启用）
CREATE TABLE scenes (
  id         TEXT PRIMARY KEY,          -- s_<uuid>
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  prompt     TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'custom',  -- custom（我的场景）/ history（对话存档）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_scenes_user ON scenes(user_id);

-- 临境对话消息（记录级）
CREATE TABLE scene_messages (
  id         TEXT PRIMARY KEY,          -- m_<uuid>
  scene_id   TEXT NOT NULL REFERENCES scenes(id),
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL,             -- user / assistant
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_msgs_scene ON scene_messages(scene_id);

-- 词句表收藏（记录级）
CREATE TABLE collections (
  id         TEXT PRIMARY KEY,          -- c_<uuid>
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL,             -- word / sentence
  text       TEXT NOT NULL,
  meaning    TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'new',  -- new / learning / mastered
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_collections_user ON collections(user_id, type);
-- 去重幂等兜底（§2.4：同一 user_id + type + text 只保留一条）
CREATE UNIQUE INDEX idx_collections_dedup ON collections(user_id, type, text);

-- 邮箱验证码（§3.7，已实施）——只存 sha256(code)，一次性，10 分钟过期
CREATE TABLE email_codes (
  id         TEXT PRIMARY KEY,          -- v_<uuid>
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,             -- register / reset
  code_hash  TEXT NOT NULL,             -- sha256(code)，不存明文
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,                   -- 一次性消费：NULL=未用，非 NULL=已用
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_email_codes_lookup ON email_codes(email, purpose, created_at);
```

> 说明：`source_ref` 为可选引用（如 `rule-2`、`stem-12`），用于「回到原处复习」，不强约束外键（内容文件可能改版）。

### 3.3 认证设计（D1 自建，开放注册）

- **注册**：`POST /api/register` — 邮箱 + 密码（≥8 位）；服务端生成 `pass_hash`；**限流**（每 IP 每小时 10 次注册，防垃圾号）
- **密码哈希（v0.2 修订）**：用 **PBKDF2**（`crypto.subtle.deriveBits`，100k+ 迭代 + 每用户随机 salt），**不用 scrypt**——`crypto.scryptSync` 来自 `node:crypto`，在 Cloudflare Workers 运行时（workerd）不可用（即使 `nodejs_compat` 支持也有限），而 Web Crypto 的 PBKDF2 是 Workers 原生能力，确定可用
- **登录**：`POST /api/login` — 校验后签发 `token`（32 字节随机）；存 `sessions` 表（只存 token 的 sha256）；返回 `token` + `userId`
- **会话**：前端存 `localStorage["korean_session"]`；请求头 `Authorization: Bearer <token>`；每次请求校验 `token_hash` + `expires_at`（30 天滑动续期）
- **登出**：`POST /api/logout` — 删除 session
- **后续可叠加**：OAuth（GitHub/Google）作为快捷登录——在 `users` 表加 `oauth_provider/oauth_id` 可空列（v2 再做，表结构已预留扩展余地）

### 3.4 同步协议（方案 C：整包 + 智能合并）

**4 个 blob key 与合并策略（Phase 3 起：custom_scenes / scene_history 迁出 blob → 记录级表，见 §3.6）：**

| key | 结构 | 合并策略 | 冲突行为 |
|---|---|---|---|
| `progress` | `{taskId: bool}` | **取并集**（任一设备标 true 即 true） | 无覆盖 |
| `training_done` | `{sentenceId: bool}` | **取并集** | 无覆盖 |
| `ai_history` | 追加日志数组 | **按 id/时间戳去重合并** | 双向保留 |
| `dismissed_tips` | `{tipId: bool}` | **取并集** | 无覆盖 |

**⚠️ 删除/清空必须用墓碑（v0.2 评审修订，方案 C 最大漏洞）**：
并集合并与 id 合并都会让「已删除」数据复活——例如设备 A 调 `clearData()` 清空训练进度并推送 `{}`，设备 B 拉取并集合并后**任务全部复活**；删除的 `ai_history` 条目也会被另一设备持有旧记录合并回来。

**墓碑规则（统一机制，全 key 生效）：**
- 结构约定：每个 blob 值为 `{ data: <原始数据>, deleted: {id: timestamp} }`（`deleted` 为删除标记映射，仅记录删除操作；`clearData` 整体清空时置 `clearedAt: timestamp`）
- 合并规则：
  - 并集类（progress/training_done/dismissed_tips）：`data` 取并集后**减去 `deleted` 中的 id**；注意：**取消勾选也算删除**，前端 toggle-off 时必须同时写 `deleted[id]`（sync.js 改造点已含此埋点），否则并集会从另一设备"复活"已取消的任务；    - id 类（blob 内仅 `ai_history`；custom_scenes / scene_history 已迁记录级）：按 id 合并，若 id 在任一端的 `deleted` 中且删除时间晚于该 id 的 updated_at，则视为已删除；**删除后另一端再编辑（新 updated_at > 删除时间）→ 复活是"后写胜出"的有意语义**（用户在删除后继续编辑了该条）；**前提：id 类数据条目需自带 updated_at**——本地旧数据无此字段，首次同步时按当前时间补齐（`ensureItemId` 补稳定 id + `time`），此后每次编辑刷新；
  - `clearData` 清空：本端生成新 `clearedAt`，合并时**比较 `clearedAt` 与另一端数据的最新时间戳，取晚者权威**——避免「A 清空(T2) → B 从未清空 → B 新增(T3)」时 B 的新数据被 A 的陈旧清空反复清掉；
- 局限声明：客户端时间戳依赖设备时钟，跨设备存在时钟偏移风险（LWW 的固有特性），2-3 人规模可接受；必要时以服务端接收时间二次裁决。
- 墓碑随时间自然陈旧（如 90 天未再出现的墓碑可裁剪），本期实现保留即可，不做裁剪。

**同步流程（登录后自动，已实施）：**
```
拉取 GET /api/sync
  ├─ 前置迁移钩子 migrateLegacySceneBlobs（§3.6.1，幂等，失败不阻断）
  ├─ 返回 4 个 blob（{key, data_json(含墓碑), updated_at}）+ collections + scenes（?since 增量）
  └─ 前端对每个 blob 执行带墓碑的合并 → 写回 localStorage → 触发页面 refreshPage()
      ├─ collections：mergeCollectionsFromServer（(type,text) upsert、后写胜出、删除传播 + pushedIds 保护、**删除墓碑防离线复活 v0.5**——见下）
      └─ 删除墓碑（v0.5 补充，本地 `korean_collections_deleted` = { "type|text": {id, ts} }）：
           syncCollectDelete 先记墓碑再发 DELETE（离线失败墓碑保留）；拉取合并时服务端条目 updatedAt < 墓碑 ts
           → 视为本端已删（不复活）+ 用**服务端真实 id** 重发 DELETE 自愈（成功才清墓碑）；updatedAt > 墓碑 ts
           → 删除后被另一端重新收藏/编辑，后写胜出复活并清墓碑；服务端与本地均无该 key → 剪枝墓碑。
      └─ scenes：mergeScenesFromServer（custom 按 title upsert；history 重建计数镜像，服务端为权威存档）
推送 POST /api/sync
  └─ 前端把 4 个 blob 的 {key, data_json(含墓碑), updated_at} 整体上传 → 服务端按 updated_at 后写胜出（key 白名单，单 blob ≤2MB）
场景/收藏变更：直接调记录级接口（POST /api/scenes、POST/DELETE /api/collections…），离线时走 localStorage 队列、恢复后重放
```

**数据存放职责（v0.4 定稿，Phase 2/3 均已实施）：**
- ✅ **Phase 2 已实施**：`progress` / `training_done` / `ai_history` / `dismissed_tips` 走 blob；`collections` 自 P2 起即走记录级 `collections` 表；
- ✅ **Phase 3 已实施**：`custom_scenes` / `scene_history` 迁出 blob → `scenes` / `scene_messages` 记录级表（含墓碑兜底迁移钩子，见 §3.6），blob 清单缩减为 4 key；
- Phase 1 的 localStorage `korean_collections` 仅为**离线缓存**，登录后直接走 `/api/collections`（含 `GET` 读取，见 §3.4 接口清单）。

**前端改造点（js/sync.js，新增一个文件，不动现有读写逻辑）：**
1. 封装 `syncPut(key, data)`：写 localStorage + 推入待同步队列（防抖 2s）
2. **离线队列必须持久化（v0.2 评审修订）**：待推送的 blob 写入 `localStorage["korean_sync_queue"]`（非仅内存），页面关闭后不丢；失败自动重试 + 指数退避（2s→30s，最多 5 次后挂起等下次打开/网络恢复）
3. 现有 9 处 `localStorage.setItem` 调用点改为 `syncPut`（保留纯本地写入的 fallback：未登录 = 仅本地）
4. `clearData()` 清空后调用 `refreshCurrentPage()` 并推送带 `clearedAt` 的 blob（既有机制复用）
5. 登录态入口：顶部导航新增「登录/注册」按钮 + 用户徽标；未登录不阻塞使用（本地优先）

**接口清单（✅ = 已实施上线）：**
```
[P2✅] POST /api/register        {email, password, code}          → {token, userId}（code = 邮箱验证码，§3.7）
[P2✅] POST /api/login           {email, password}                → {token, userId}
[P2✅] POST /api/logout          (Bearer)                         → 204
[P2✅] GET  /api/me              (Bearer)                         → {userId, email, blobs:{...}, collections, scenes}（含迁移钩子）
[P2✅] GET  /api/sync            (Bearer, ?since=ts)              → 增量 {blobs, collections, scenes}（含迁移钩子）
[P2✅] POST /api/sync            (Bearer, {blobs:[...]})          → {ok, pushed}（后写胜出，key 白名单，单 blob ≤2MB）
[P3✅] GET  /api/scenes          (Bearer, ?kind=custom|history)   → {scenes:[...]}（updated_at DESC）
[P3✅] POST /api/scenes          (Bearer, {title, prompt, kind?, messages?}) → {scene}
        └─ custom 按 (user,kind,title) 幂等 upsert（同标题=更新 prompt）；history 永远新建 + 可选批量 messages（≤200 条）
[P3✅] GET  /api/scenes/:id/messages (Bearer)                     → {messages:[...]}（created_at ASC；越权 404）
[P3✅] POST /api/scenes/:id/messages (Bearer, {role, content})    → {message}（role 白名单；越权 404）
[P3✅] DELETE /api/scenes/:id    (Bearer)                         → 204（级联删消息；越权 404）
[P3✅] GET  /api/stats           (Bearer)                         → 学习统计聚合（§3.6.3）
[补充✅] POST /api/send-code     {email, purpose: register|reset} → {ok}（防枚举/限流/dev 回显门控，§3.7）
[补充✅] POST /api/reset-password {email, code, newPassword}      → {ok}（重置后 DELETE 全部会话）
[P2✅] GET  /api/collections     (Bearer)                         → {items}
[P2✅] POST /api/collections     (Bearer, {item})                 → {item}（按 user_id+type+text 幂等 upsert）
[P2✅] DELETE /api/collections/:id (Bearer)                       → 204
```

**安全清单：**
- 密码 PBKDF2 + 每用户随机 salt；token 只存哈希
- 所有接口强制 Bearer 校验 + 用户数据按 `user_id` 过滤（防越权）
- 注册接口限流 + **邮箱验证（Resend 验证码，§3.7）**；登录失败限流（防爆破）
- AI key 继续只在服务端（现状不变）
- CORS 仅放行站点自身域名；`/api/*` 拒绝静态目录泄露

### 3.5 扩展性路径（demo → 规模化）

| 阶段 | 容量 | 动作 |
|---|---|---|
| 现在（≤100 人） | 免费版足够 | 本方案实施 |
| 数百学生 | 免费版上限附近 | 付费版（$5/月）自动扩容；行读写按量付费 |
| 数千学生 | 10GB 以上 | 多库分片（按 user_id hash 分库）+ 统计任务用 Cron Trigger 离线聚合 |
| 超大规模 | — | 引入 R2 存音频/大数据 + D1 只存指针（已在架构中预留） |

### 3.6 Phase 3 落地实录：场景记录级迁移 + 服务端统计（已实施）

#### 3.6.1 迁移钩子行为（墓碑兜底迁移）

**触发点**：`GET /api/sync` 与 `GET /api/me` 在返回数据前先调用 `migrateLegacySceneBlobs(db, userId)`（`functions/api/_shared.js`），幂等且外层 try/catch——**迁移失败不阻断同步**（记录级数据仍可用，下次拉取重试，避免 500）。

**对旧 blob（`LEGACY_SCENE_BLOB_KEYS = ["custom_scenes", "scene_history"]`）的处理：**
1. 读取 `user_blobs` 整包 JSON，解墓碑结构 `{data, deleted, clearedAt}`；
2. `clearedAt` 存在（整体清空过）→ 跳过该 key 全部数据（清空语义保留）；
3. `deleted[id]` 中标记的条目不迁移（尊重删除墓碑）；
4. `custom_scenes` → 逐条 INSERT `scenes(kind='custom')`；`scene_history` 每条对话 → `scenes(kind='history')` + 消息批量入 `scene_messages`；
5. **保留原始时间戳**（`item.time` 而非迁移时刻）——避免历史对话聚到迁移当天导致 `learning_days` 失真；
6. 迁移完成删除 blob 行（幂等：无 blob 则无操作）。

#### 3.6.2 场景接口契约（实际实现）

| 接口 | 行为 |
|---|---|
| `GET /api/scenes?kind=custom\|history` | 按 user 过滤 + kind 可选过滤，`ORDER BY updated_at DESC` |
| `POST /api/scenes {title, prompt, kind?, messages?}` | **custom 按 (user, kind, title) 幂等 upsert**（同标题保存 = 更新 prompt）；**history 永远新建**（同名对话可多次发生）+ 可选 `messages`（≤200 条）批量一次入库，避免 N+1 |
| `GET /api/scenes/:id/messages` | 按 `created_at ASC`；越权/不存在 → 404 |
| `POST /api/scenes/:id/messages {role, content}` | role 白名单 user/assistant；越权/不存在 → 404 |
| `DELETE /api/scenes/:id` | **级联删除**该场景全部 `scene_messages` 再删场景；越权/不存在 → 404 |

**前端接入（js/sync.js）**：`mergeScenesFromServer`（custom 按 title upsert、history 重建本地计数镜像，服务端为权威存档）、`syncSceneCreate`（回写服务端 id 供删除命中）、`syncSceneDelete`、`syncSceneArchive`（finishSceneChat 整包存档）、`pushLocalScenesIfMissing`（Phase 2 离线积攒场景首次登录上云）。

#### 3.6.3 服务端统计 `GET /api/stats`（Bearer）

```json
{
  "userId": "u_...", "email": "...", "created_at": 1710000000000,
  "training_done": 12, "progress_done": 8, "ai_history": 5,
  "collections": { "total": 3, "words": 2, "sentences": 1 },
  "scenes": { "total": 2, "custom": 1, "history": 1 },
  "messages": 14, "learning_days": 6, "last_active_at": 1710000000000
}
```
- 学习天数：`user_blobs.updated_at` UNION `collections/scenes/scene_messages.created_at` 按**天去重**计数（`Promise.all` 之后单独串行执行）；
- blob 计数前必须先解墓碑包装（`unwrapBlobData`：`{data,...}` → `data`），兼容旧版裸结构；
- 全部按 `user_id` 过滤，7 条聚合查询 `Promise.all` 并行 + 1 条学习天数 UNION。

### 3.7 邮箱验证 + 密码重置（已实施，Phase 3 后补充交付）

见 `functions/api/send-code.js` / `reset-password.js` / `register.js` 与 `schema.sql` 的 `email_codes` 表：
- 验证码只存 `sha256(code)`，**一次性**（`used_at` 原子消费，防并发 TOCTOU）、10 分钟过期；
- `POST /api/send-code {email, purpose}`：register/reset 双用途；已注册邮箱发注册码 → 409；未注册邮箱重置 → 统一 `{ok}` **防枚举**；IP 5 次/10 分 + 邮箱 1 次/10 分（**分用途 key**）；
- 无 `RESEND_API_KEY` 时仅 localhost / `ALLOW_DEV_CODE=1` 回显 code（dev 测试），生产返回 503 门控（不泄露验证码）；
- `POST /api/reset-password`：验证码 + 新密码，成功后 **DELETE 该用户全部会话**（旧 token 立即失效）；
- 生产需 `wrangler pages secret put RESEND_API_KEY`（`RESEND_FROM` 已在 wrangler.toml `[env.production.vars]` 声明）。

---

## 4. 实施计划（Phase 1–3 已完成，Phase 4 进行中）

### Phase 1：内容重构（纯前端）—— ✅ 已完成
- [x] 1.1 新增 `js/word_mnemonics_data.js`（从 REFERENCE 迁移助词/词尾/疑问词数据）
- [x] 1.2 筑基页拆 Tab：句的助记 / 词的助记（`renderSkeleton` + Tab 切换 + 表格渲染公共函数）
- [x] 1.3 新增词句表页（导航 + 词/句双 Tab + 收藏渲染 + 复习抽认卡 + status 流转），本地 localStorage 先行（key：`korean_collections`）
- [x] 1.4 全环节收藏入口埋点（筑基/剥茧/抽丝/砥砺/临境/拾遗）
- [x] 验证：`npm run audit:strict` + E2E + 浏览器实测；质量门同步更新（词句表入 E2E 导航循环、审计清单、CI 页面列表）

### Phase 2：后端与同步（D1 + 认证 + 方案 C）—— ✅ 已完成
- [x] 2.1 `wrangler.toml` 添加 D1 绑定 + `schema.sql` 建表
- [x] 2.2 `functions/api/*`：register/login/logout/me/sync 接口（PBKDF2、token、限流）+ **`/api/collections` CRUD（GET/POST/DELETE）**
- [x] 2.3 `js/sync.js`：syncPut 封装 + 登录态 + 拉取合并/推送 + 首次登录本地数据上云
- [x] 2.4 app.js setItem 改 syncPut；clearData 联动推送（墓碑）
- [x] 2.5 词句表接入 `/api/collections` 同步（拉取合并 / 收藏推送 / 删除即时生效，含删除传播 + pushedIds 保护）
- [x] 验证：本地 `wrangler pages dev` + D1 实测注册/登录/双端同步；E2E 扩展

### Phase 3：记录级完善与统计 —— ✅ 已完成（2026-08-01 上线生产）
- [x] 3.1 scenes/messages 记录级 CRUD 接口 + 前端接入（替代 blob 内嵌）+ **墓碑兜底迁移钩子**（§3.6.1）
- [x] 3.2 服务端统计 `/api/stats`（学习天数/完成率/收藏数/对话量，§3.6.3）——D1 SQL 聚合
- [x] 3.3 多设备冲突实测（并集 / 后写胜出 / 墓碑删除 / 清空复活防护 / 删除传播）
- [x] 验证：全量 E2E（25 PASS）+ 双设备冲突场景实测 + 远程部署验证

### Phase 4：学习体验增强（下一步）
- [ ] 4.1 前端接入 `/api/stats`：学习统计仪表盘（学习天数 / 完成率 / 收藏数 / 对话量），登录用户跨设备一致展示
- [ ] 4.2 跨设备实时同步：登录后定时轮询 `/api/sync`（?since 增量）+ 标签页可见性触发拉取，冲突提示 UI
- [ ] 4.3 词句表导出/导入完善 + 复习进度统计（抽认卡次数 / 掌握曲线 / 每日提醒）
- [ ] 4.4 （可选）OAuth 快捷登录：`users` 表加 `oauth_provider` / `oauth_id` 可空列，GitHub/Google

> ✅ 风险已消解：Phase 2 前的 1 天 spike（D1 绑定打通 + 单个 blob 同步跑通）已完成，不再阻塞。

---

## 5. 待确认问题（评审后定稿）

1. **「时宜」含义 —— ✅ 已拍板**：指一位**用户**（她的临境场景/对话/收藏绑定其账号）。Phase 3 记录级迁移即按此落地：`scenes` / `scene_messages` 以 `user_id` 归属。
2. **筑基 Tab 默认页 —— ✅ 已拍板**：默认「句的助记」（与 AI rules 编号一致），Phase 1 已实现。
3. 词句表复习模式是否需要「定时复习提醒」（如每日 N 条）——本期只做状态流转；**提醒列入 Phase 4.3 候选**（依赖实时/推送基础，见 Phase 4）。
4. **开放注册邮箱验证 —— ✅ 已实施**（§3.7，Phase 3 后补充交付）：Resend 验证码 + 密码重置 + 防枚举/限流/原子消费。
