-- Basic Korean V2 Phase 2 D1 schema
-- 设计文档：docs/design/v2-upgrade-plan.md §3.2
-- 应用：wrangler d1 execute basic-korean-db --remote --file=./schema.sql
--       wrangler d1 execute basic-korean-db --local  --file=./schema.sql

-- 用户
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,          -- u_<uuid>
  email      TEXT UNIQUE NOT NULL,
  pass_hash  TEXT NOT NULL,             -- PBKDF2(password, salt, 100k iters)
  salt       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 会话（登录态）
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,          -- sha256(token)，不存明文
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 通用同步表（方案 C 的核心：6 个 blob key + 未来未知类型兜底）
CREATE TABLE IF NOT EXISTS user_blobs (
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,             -- progress / training_done / ai_history / scene_history / custom_scenes / dismissed_tips / ...
  data_json  TEXT NOT NULL,             -- 整包 JSON（方案 C，含墓碑 {data, deleted, clearedAt}）
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- 临境场景（记录级，Phase 3 启用）
-- kind: custom = 用户自定义场景（我的场景）| history = 对话记录（finishSceneChat 存档）
CREATE TABLE IF NOT EXISTS scenes (
  id         TEXT PRIMARY KEY,          -- s_<uuid>
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  prompt     TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'custom',  -- custom / history
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenes_user ON scenes(user_id);

-- 临境对话消息（记录级，Phase 3 启用）
CREATE TABLE IF NOT EXISTS scene_messages (
  id         TEXT PRIMARY KEY,          -- m_<uuid>
  scene_id   TEXT NOT NULL REFERENCES scenes(id),
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL,             -- user / assistant
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msgs_scene ON scene_messages(scene_id);
-- 对话消息统计辅助索引（/api/stats 按用户聚合）
CREATE INDEX IF NOT EXISTS idx_msgs_user ON scene_messages(user_id);

-- 词句表收藏（记录级，Phase 2 启用）
CREATE TABLE IF NOT EXISTS collections (
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
CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id, type);
-- 去重幂等兜底（§2.4：同一 user_id + type + text 只保留一条）
CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_dedup ON collections(user_id, type, text);

-- 邮箱验证码（防垃圾注册 + 密码重置）
-- 只存 sha256(code) 哈希，不存明文；一次性使用（used_at 置位）；10 分钟过期
CREATE TABLE IF NOT EXISTS email_codes (
  id         TEXT PRIMARY KEY,          -- v_<uuid>
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,             -- register / reset
  code_hash  TEXT NOT NULL,             -- sha256(code)
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,                   -- NULL = 未用；非 NULL = 已消费
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes(email, purpose, created_at);
