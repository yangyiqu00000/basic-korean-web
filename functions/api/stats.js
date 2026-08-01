// functions/api/stats.js — GET /api/stats (Bearer) 服务端学习统计聚合（Phase 3）
// → {userId, email, created_at, training_done, progress_done, ai_history, collections:{...}, scenes:{...}, messages, learning_days, last_active_at}
import { json, getSessionUser, BLOB_KEYS } from "./_shared.js";

function countTrue(obj) {
  if (!obj || typeof obj !== "object") return 0;
  return Object.values(obj).filter(v => v === true).length;
}
function dayKey(ts) {
  const d = new Date(Number(ts));
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await getSessionUser(env.basic_korean_db, request);
  if (!user) return json({ error: "未登录或登录已过期" }, 401);

  const db = env.basic_korean_db;
  const uid = user.userId;

  const [userRow, trainingRow, progressRow, aiRow, colRes, scenesRes, msgRes] = await Promise.all([
    db.prepare("SELECT created_at FROM users WHERE id = ?").bind(uid).first(),
    db.prepare("SELECT data_json FROM user_blobs WHERE user_id = ? AND key = 'training_done'").bind(uid).first(),
    db.prepare("SELECT data_json FROM user_blobs WHERE user_id = ? AND key = 'progress'").bind(uid).first(),
    db.prepare("SELECT data_json FROM user_blobs WHERE user_id = ? AND key = 'ai_history'").bind(uid).first(),
    db.prepare("SELECT type, COUNT(*) AS c FROM collections WHERE user_id = ? GROUP BY type").bind(uid).all(),
    db.prepare("SELECT kind, COUNT(*) AS c FROM scenes WHERE user_id = ? GROUP BY kind").bind(uid).all(),
    db.prepare("SELECT COUNT(*) AS c FROM scene_messages WHERE user_id = ?").bind(uid).first()
  ]);

  // 学习天数：所有时间戳去重到天（blob 更新时间 + 收藏/场景/消息创建时间）
  const daySet = new Set();
  const stampRows = await db.prepare(
    "SELECT updated_at FROM user_blobs WHERE user_id = ? " +
    "UNION SELECT created_at FROM collections WHERE user_id = ? " +
    "UNION SELECT created_at FROM scenes WHERE user_id = ? " +
    "UNION SELECT created_at FROM scene_messages WHERE user_id = ?"
  ).bind(uid, uid, uid, uid).all();
  stampRows.results.forEach(r => {
    if (r.updated_at) daySet.add(dayKey(r.updated_at));
    if (r.created_at) daySet.add(dayKey(r.created_at));
  });

  // 注意：blob 的 data_json 是墓碑包装 {data, deleted, clearedAt}，必须先取 .data 再计数
  const trainingDone = countTrue(unwrapBlobData(trainingRow && trainingRow.data_json));
  const progressDone = countTrue(unwrapBlobData(progressRow && progressRow.data_json));
  let aiHistory = 0;
  try {
    const aiParsed = JSON.parse((aiRow && aiRow.data_json) || "{}");
    aiHistory = Array.isArray(aiParsed.data) ? aiParsed.data.length : (Array.isArray(aiParsed) ? aiParsed.length : 0);
  } catch (e) {}

  const colCounts = { total: 0, words: 0, sentences: 0 };
  colRes.results.forEach(r => {
    colCounts.total += r.c;
    if (r.type === "word") colCounts.words += r.c;
    if (r.type === "sentence") colCounts.sentences += r.c;
  });
  const sceneCounts = { custom: 0, history: 0 };
  scenesRes.results.forEach(r => { sceneCounts[r.kind] = (sceneCounts[r.kind] || 0) + r.c; });

  return json({
    userId: uid,
    email: user.email,
    created_at: userRow ? userRow.created_at : null,
    training_done: trainingDone,
    progress_done: progressDone,
    ai_history: aiHistory,
    collections: colCounts,
    scenes: { total: sceneCounts.custom + sceneCounts.history, ...sceneCounts },
    messages: msgRes ? msgRes.c : 0,
    learning_days: daySet.size,
    last_active_at: Math.max(
      ...stampRows.results.map(r => r.updated_at || r.created_at || 0),
      userRow ? userRow.created_at : 0
    )
  });
}

// 安全解析（data_json 可能损坏）
function safeParse(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch (e) { return null; }
}
// 墓碑包装解包：{data, deleted, clearedAt} → data；兼容旧版直接存裸结构的 blob
function unwrapBlobData(json) {
  const parsed = safeParse(json);
  if (!parsed) return null;
  if (parsed && typeof parsed === "object" && "data" in parsed) return parsed.data;
  return parsed;
}
