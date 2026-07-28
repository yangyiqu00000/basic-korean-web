// functions/ai/index.js — AI 句子拆解
export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    const text = body.text;
    const rules = body.rules;

    if (!text) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
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

    // 构造 prompt（与 tts_server.js 保持一致）
    const systemPrompt = `你是一个韩语语法助教。对于用户输入的句子，输出严格 JSON：

{
  "kr": "韩语翻译（-요 体，命令用 -세요）",
  "full": "完整中文翻译",
  "breakdown": [
    { "part": "单词/词缀", "tag": "词性(词干/助词/终结词尾/连接词尾/时态词尾/否定/语气)", "meaning": "含义", "label": "细化标签" }
  ],
  "rules": [1,2,3,4,5,6,7],
  "tip": "一句话学习建议",
  "examples": [
    { "kr": "例句1", "zh": "翻译1" },
    { "kr": "例句2", "zh": "翻译2" }
  ]
}

规则编号含义：
1=主宾谓结构，2=助词系统，3=时态词尾，4=敬语(-요体)，5=连接词尾(-고/-서/-지만)，6=否定(안/못/-지 않다)，7=疑问/命令/提议
敬语用 -요 体（命令用 -세요）。只返回 JSON，不要包裹 markdown 代码块。`;

    const response = await fetch(apiBase + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        temperature: 0.3,
        max_tokens: 2048
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
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: content }), {
        status: 502,
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
