// functions/ai/index.js — AI 句子拆解
// ============================================
// 容错 JSON 解析（与本地 tts_server.js 同款）
// agnes 系列模型偶发输出不规范 JSON（未转义引号 / JS 式 \' 转义 / 尾逗号），
// 这里逐字符扫描修复后再解析，避免 "AI response parse failed"。
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
    const text = body.text;

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
    { "part": "单词/词缀", "tag": "词干|助词|词尾", "meaning": "含义", "label": "角色标签(主题/主语/宾语/时间/场所/方向/伴随/起点/终点/连接/条件/终结/进行/否定/命令/提议/疑问/敬语/感慨，可省略)" }
  ],
  "rules": [1,2,3,4,5,6,7],
  "tip": "一句话学习建议",
  "examples": [
    { "kr": "例句1", "full": "翻译1", "breakdown": [{ "part": "...", "tag": "词干|助词|词尾", "meaning": "...", "label": "..." }] },
    { "kr": "例句2", "full": "翻译2", "breakdown": [] }
  ]
}

【词性标签】只有三种：词干、助词、词尾（与本地 tts_server 一致）
【角色标签】主题、主语、宾语、时间、场所、方向、伴随、起点、终点、连接、条件、终结、进行、否定、命令、提议、疑问、敬语、感慨
规则编号含义：
1=主宾谓结构，2=助词系统，3=时态词尾，4=敬语(-요体)，5=连接词尾(-고/-서/-지만)，6=否定(안/못/-지 않다)，7=疑问/命令/提议
敬语用 -요 体（命令用 -세요）。只返回 JSON，不要包裹 markdown 代码块。
【重要】无论用户问什么（时间、日期、天气、建议、闲聊等），你都不要直接回答用户的问题本身，只把这句话翻译成韩语并做语法教学拆解。
【JSON 规范】字符串内的中文引号一律使用「」或单引号，严禁使用英文双引号；不要使用反斜杠转义引号（如 \'）；只输出合法 JSON。`;

    // 模型偶发超时/空内容/socket 中断/输出不合规 JSON，自动重试一次
    let parsed = null;
    let rawContent = "";
    let lastErr = null;
    for (let attempt = 0; attempt < 2 && parsed === null; attempt++) {
      try {
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
            max_tokens: 4096
          })
        });

        if (!response.ok) {
          throw new Error("AI API error: " + (await response.text()));
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        rawContent = content;

        // 尝试解析 JSON：有些 AI 在 JSON 前后会附带口语化文本
        let jsonText = content.trim();
        // 从第一个 { 开始截取
        const jsonStart = jsonText.indexOf('{');
        const jsonEnd = jsonText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
        }
        jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

        parsed = parseAIJSON(jsonText);
      } catch (e) {
        lastErr = e;
      }
    }

    if (parsed === null) {
      // 上游 API 错误（非 2xx）保留原始错误与 502；解析类失败才报 parse failed
      const isApiError = !!lastErr && /^AI API error/.test(lastErr.message);
      return new Response(JSON.stringify({ error: isApiError ? lastErr.message : "AI response parse failed", raw: rawContent }), {
        status: isApiError ? 502 : 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
