// functions/ai/status.js — AI 服务状态检测
export async function onRequest(context) {
  const { env } = context;
  
  // 检查是否配置了 AI API Key
  if (!env.AI_API_KEY) {
    return new Response(JSON.stringify({ available: false, error: "AI_API_KEY not configured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ available: true, model: env.AI_MODEL || "gpt-4o-mini" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
