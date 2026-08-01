// functions/ai/chat.js — AI 情景对话
export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    const messages = body.messages;
    // 前端 app.js 发送的是 { scene, messages }（与本地 tts_server /ai/chat 一致），不是 scenePrompt
    const scenePrompt = body.scene || body.scenePrompt;

    if (!messages || !scenePrompt) {
      return new Response(JSON.stringify({ error: "Missing messages or scene" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const apiBase = env.AI_API_BASE || "https://api.openai.com/v1";
    const apiKey = env.AI_API_KEY;
    const model = env.AI_MODEL || "gpt-4o-mini";

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI_API_KEY not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 构造对话消息
    const systemMsg = {
      role: "system",
      content: `你是一个韩国人，正在参与角色扮演对话。场景设定：${scenePrompt}\n\n规则：\n1. 只用韩语回复（-요 体）\n2. 对话自然，像真实韩国人说话\n3. 如果用户用中文，你理解后用韩语继续\n4. 回复后输出 JSON 格式：{"kr": "韩语回复", "zh": "中文翻译", "breakdown": [{"part": "单词", "tag": "词性", "meaning": "含义"}], "tips": "一句话语法说明"}`
    };

    const chatMessages = [systemMsg];
    for (const msg of messages) {
      chatMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content
      });
    }

    const response = await fetch(apiBase + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: "AI API error: " + errText }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // 尝试解析 JSON：有些 AI 在 JSON 前后会附带口语化文本
    let jsonText = content.trim();
    // 从第一个 { 开始截取
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    }
    jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    
    try {
      const parsed = JSON.parse(jsonText);
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      // 如果 AI 没返回 JSON，把原文包装成基本格式
      return new Response(JSON.stringify({
        kr: content.trim(),
        zh: "",
        breakdown: [],
        tips: ""
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
