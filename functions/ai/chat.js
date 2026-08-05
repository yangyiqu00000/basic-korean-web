// functions/ai/chat.js — AI 情景对话
// ============================================
// 容错 JSON 解析（与本地 tts_server.js 同款）
// ============================================
function repairModelJSON(s) {
  s = s.replace(/(^|[^\\])\\'/g, "$1'");
  const out = [];
  let inStr = false;
  let innerQuoteOpen = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') {
        out.push(c);
        if (i + 1 < s.length) { out.push(s[i + 1]); i++; }
        continue;
      }
      if (c === '"') {
        const next = s[i + 1];
        const nextNonWs = s.slice(i + 1).replace(/^\s+/, '')[0] || '';
        const isClosing = next === ',' || next === '}' || next === ']' || next === ':' ||
          ((next === ' ' || next === '\t' || next === '\n' || next === '\r') && /[,}\]:]/.test(nextNonWs));
        if (isClosing) { inStr = false; innerQuoteOpen = false; out.push(c); }
        else { out.push(innerQuoteOpen ? '」' : '「'); innerQuoteOpen = !innerQuoteOpen; }
        continue;
      }
      if (c === '\n') { out.push('\\n'); continue; }
      if (c === '\r') { out.push('\\r'); continue; }
      if (c === '\t') { out.push('\\t'); continue; }
      out.push(c);
      continue;
    }
    if (c === '"') { inStr = true; innerQuoteOpen = false; out.push(c); continue; }
    if (c === ',') {
      const rest = s.slice(i + 1).replace(/^\s+/, '');
      if (rest[0] === '}' || rest[0] === ']') continue;
      out.push(c);
      continue;
    }
    out.push(c);
  }
  return out.join('');
}

// 容错解析器（最后一层兑底）：处理缺失逗号、单引号字符串、裸键名、尾逗号、注释等
function tolerantParseJSON(src) {
  let i = 0;
  function skipWS() {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (src[i] === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      break;
    }
  }
  function parseString() {
    const q = src[i++];
    let out = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        const n = src[i + 1];
        if (n === 'u') { out += String.fromCharCode(parseInt(src.substr(i + 2, 4), 16)); i += 6; }
        else if (n === 'n') { out += '\n'; i += 2; }
        else if (n === 't') { out += '\t'; i += 2; }
        else if (n === 'r') { out += '\r'; i += 2; }
        else if (n === 'b') { out += '\b'; i += 2; }
        else if (n === 'f') { out += '\f'; i += 2; }
        else { out += n; i += 2; }
        continue;
      }
      if (c === q) { i++; return out; }
      out += c; i++;
    }
    throw new Error('Unterminated string at ' + i);
  }
  function parseValue() {
    skipWS();
    const c = src[i];
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '"' || c === "'") return parseString();
    if (src.substr(i, 4) === 'true') { i += 4; return true; }
    if (src.substr(i, 5) === 'false') { i += 5; return false; }
    if (src.substr(i, 4) === 'null') { i += 4; return null; }
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    throw new Error('Unexpected char at ' + i + ': ' + src[i]);
  }
  function parseObject() {
    i++;
    const obj = {};
    skipWS();
    if (src[i] === '}') { i++; return obj; }
    for (;;) {
      skipWS();
      if (src[i] === '}') { i++; return obj; }
      let key;
      if (src[i] === '"' || src[i] === "'") key = parseString();
      else {
        const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i));
        if (!m) throw new Error('Bad key at ' + i);
        key = m[0]; i += m[0].length;
      }
      skipWS();
      if (src[i] === ':') i++;
      obj[key] = parseValue();
      skipWS();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === '}') { i++; return obj; }
      // 缺失逗号：直接进入下一个键
      const nc = src[i];
      if (nc === '"' || nc === "'" || /[A-Za-z_$]/.test(nc)) continue;
      throw new Error('Expected , or } at ' + i);
    }
  }
  function parseArray() {
    i++;
    const arr = [];
    skipWS();
    if (src[i] === ']') { i++; return arr; }
    for (;;) {
      arr.push(parseValue());
      skipWS();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === ']') { i++; return arr; }
      const nc = src[i];
      if (nc === '{' || nc === '[' || nc === '"' || nc === "'" || /[-0-9tfn]/.test(nc)) continue;
      throw new Error('Expected , or ] at ' + i);
    }
  }
  let v = parseValue();
  skipWS();
  if (i < src.length) {
    // 顶层多对象拼接（推理模型偶尔先输出 reasoning 对象再接答案对象）：取最后一个
    if (src[i] === '{') {
      while (i < src.length) {
        skipWS();
        if (src[i] !== '{') break;
        v = parseValue();
        skipWS();
      }
      if (i < src.length) throw new Error('Trailing content at ' + i);
      return v;
    }
    throw new Error('Trailing content at ' + i);
  }
  return v;
}

function parseAIJSON(raw) {
  let s = String(raw).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.substring(start, end + 1);
  if (!s) throw new Error('AI 返回内容为空');
  let parsed;
  try {
    parsed = JSON.parse(s);
  } catch (e) {
    try {
      parsed = JSON.parse(repairModelJSON(s));
    } catch (e2) {
      try {
        parsed = tolerantParseJSON(s);
      } catch (e3) {
        throw new Error('解析 AI 返回失败: ' + e3.message);
      }
    }
  }
  // 模型可能返回 null/数组/标量（合法 JSON 但非教学对象），统一视为失败
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI 返回内容不是有效 JSON 对象');
  }
  return parsed;
}

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
      content: `你是一个韩国人，正在参与角色扮演对话。场景设定：${scenePrompt}\n\n规则：\n1. 只用韩语回复（-요 体）\n2. 对话自然，像真实韩国人说话\n3. 如果用户用中文，你理解后用韩语继续\n4. 回复后输出 JSON 格式：{"kr": "韩语回复", "zh": "中文翻译", "breakdown": [{"part": "单词", "tag": "词性", "meaning": "含义"}], "tips": "一句话语法说明"}
【JSON 规范】字符串内的中文引号一律使用「」或单引号，严禁使用英文双引号；不要使用反斜杠转义引号（如 \'）；只输出合法 JSON。`
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
      const parsed = parseAIJSON(jsonText);
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
