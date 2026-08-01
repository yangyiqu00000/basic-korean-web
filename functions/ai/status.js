// functions/ai/status.js — AI 服务状态检测
export async function onRequest(context) {
  const { env } = context;
  
  // 检查是否配置了 AI API Key
  // 注意：字段名必须与前端 checkAIService 期望的 d.configured 一致（本地 tts_server /ai/status 同样返回 configured）
  if (!env.AI_API_KEY) {
    return new Response(JSON.stringify({ configured: false, error: "AI_API_KEY not configured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ configured: true, model: env.AI_MODEL || "gpt-4o-mini" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
