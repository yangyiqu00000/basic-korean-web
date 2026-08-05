const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.join(__dirname, 'audio');
const DEFAULT_VOICE = 'ko-KR-SunHiNeural';
const PORT = 1234;

// 加载 AI 配置
let AI_CONFIG = null;
const CONFIG_PATH = path.join(__dirname, 'ai_config.json');
try {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  AI_CONFIG = JSON.parse(raw);
} catch (e) {
  console.log('  ⚠️  ai_config.json 未找到或格式错误，AI 功能不可用');
}

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ============================================
// AI 拆解 Prompt
// ============================================
const AI_SYSTEM_PROMPT = `你是一个韩语教学AI。用户会给你一句中文，你需要按照以下要求进行教学拆解：

1. 将中文翻译成韩语（统一使用 -요 敬语体结尾，除非是命令句用 -세요）
2. 将韩语句子拆解为最小单位，每个单位标注词性和角色
3. 给出学习提示
4. 提供 2 个使用相同语法点的拓展例句

【词性标签】只有三种：词干、助词、词尾
【角色标签】从以下选择：主题、主语、宾语、时间、场所、方向、伴随、起点、终点、连接、条件、终结、进行、否定、命令、提议、疑问、敬语、感慨
- 词干不需要 label（除非是否定词 안/못，label 为"否定"）
- 助词的 label 是其在句中的角色（主题/主语/宾语/时间/场所/方向/伴随/起点/终点）
- 词尾的 label 是其功能（终结/连接/条件/进行/否定/命令/提议/疑问/敬语/感慨）

【骨架规则编号】
① 主宾谓（词干/名词）
② 助词
③ 时态（过去/未来/进行）
④ 敬语（-요/-습니다/-시-）
⑤ 连接（-고/-서/-지만/-면）
⑥ 否定（안/못）
⑦ 语气（命令/提议/疑问/感慨）

【重要】无论用户问什么（时间、日期、天气、建议、闲聊等），你都不要直接回答用户的问题本身，只把这句话翻译成韩语并做语法教学拆解。

请严格返回以下JSON格式（不要包含任何其他文字，不要用 markdown 代码块）：
{
  "kr": "韩语句子",
  "full": "中文翻译",
  "breakdown": [
    {"part": "韩语词", "tag": "词干|助词|词尾", "meaning": "中文含义", "label": "角色标签(可省略)"}
  ],
  "rules": [1, 2],
  "tip": "一句话学习提示，指出关键语法点",
  "examples": [
    {"kr": "拓展例句韩语", "full": "拓展例句中文", "breakdown": [{"part":"...","tag":"...","meaning":"...","label":"..."}]}
  ]
}

【JSON 规范】字符串内的中文引号一律使用「」或单引号，严禁使用英文双引号；不要使用反斜杠转义引号（如 \'）；只输出合法 JSON。`;

// ============================================
// AI 情景对话 Prompt
// ============================================
const CHAT_SYSTEM_PROMPT = `你是一个韩语情景对话练习AI。用户选择了一个场景，你需要扮演场景中的韩国角色与用户对话。

规则：
1. 始终使用 -요 体（敬语），这是初学者唯一需要掌握的敬语形式
2. 每次回复只用 1-2 句韩语，不要太长
3. 自然地推进对话——提问、回应、引导用户继续
4. 如果用户说中文，你要理解意思并用韩语回复（不要翻译用户的中文，直接当作对话内容回应）
5. 如果用户说韩语，正常对话回应
6. 始终保持角色设定，不要跳出角色

返回格式（严格JSON，不要包含任何其他文字，不要用 markdown 代码块）：
{
  "kr": "你的韩语回复",
  "zh": "韩语回复的中文翻译",
  "breakdown": [
    {"part": "韩语词", "tag": "词干|助词|词尾", "meaning": "中文含义", "label": "角色标签(可省略)"}
  ]
}

【词性标签】只有三种：词干、助词、词尾
【角色标签】主题、主语、宾语、时间、场所、方向、伴随、起点、终点、连接、条件、终结、进行、否定、命令、提议、疑问、敬语、感慨
- 词干不需要 label（除非是否定词 안/못，label 为"否定"）
- 助词的 label 是其在句中的角色
- 词尾的 label 是其功能

【JSON 规范】字符串内的中文引号一律使用「」或单引号，严禁使用英文双引号；不要使用反斜杠转义引号（如 \'）；只输出合法 JSON。`;

// ============================================
// 容错 JSON 解析
// agnes 系列模型偶发输出不规范 JSON（未转义引号 / JS 式 \' 转义 / 尾逗号），
// 这里逐字符扫描修复后再解析，避免 "AI response parse failed"。
// ============================================
function repairModelJSON(s) {
  // 1) JS 风格 \' 转义（JSON 中不合法）→ 还原为单引号（排除已转义的 \\）
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
        // 判断结束引号 vs 串内未转义引号：结束引号后只可能是结构字符
        const next = s[i + 1];
        const nextNonWs = s.slice(i + 1).replace(/^\s+/, '')[0] || '';
        const isClosing = next === ',' || next === '}' || next === ']' || next === ':' ||
          ((next === ' ' || next === '\t' || next === '\n' || next === '\r') && /[,}\]:]/.test(nextNonWs));
        if (isClosing) { inStr = false; innerQuoteOpen = false; out.push(c); }
        else { out.push(innerQuoteOpen ? '」' : '「'); innerQuoteOpen = !innerQuoteOpen; }
        continue;
      }
      // 字符串内裸换行/制表符 → 转义（JSON 不允许裸控制字符）
      if (c === '\n') { out.push('\\n'); continue; }
      if (c === '\r') { out.push('\\r'); continue; }
      if (c === '\t') { out.push('\\t'); continue; }
      out.push(c);
      continue;
    }
    if (c === '"') { inStr = true; innerQuoteOpen = false; out.push(c); continue; }
    // 跳过尾逗号（如 [1,2,] / {"a":1,}）
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
  // 去掉可能的 markdown 代码块包裹
  let s = String(raw).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  // 截取第一个 { 到最后一个 }（模型偶发在 JSON 前后附加口语文字）
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

function callAI(userText) {
  return new Promise((resolve, reject) => {
    if (!AI_CONFIG || !AI_CONFIG.api_key || AI_CONFIG.api_key.includes('YOUR-API-KEY')) {
      reject(new Error('请先在 ai_config.json 中配置 API Key'));
      return;
    }

    const body = JSON.stringify({
      model: AI_CONFIG.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: userText }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    const url = new URL(AI_CONFIG.api_base + '/chat/completions');
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_CONFIG.api_key,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        if (resp.statusCode !== 200) {
          reject(new Error('AI API 返回 ' + resp.statusCode + ': ' + data.substring(0, 200)));
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices[0].message.content.trim();
          // 去掉可能的 markdown 代码块包裹
          resolve(parseAIJSON(content));
        } catch (e) {
          reject(new Error(/解析 AI 返回失败/.test(e.message) ? e.message : '解析 AI 返回失败: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    // agnes-2.5-flash 为推理模型，含 reasoning + 冷启动，放宽超时避免误报
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('AI API 请求超时')); });
    req.write(body);
    req.end();
  });
}

// 情景对话调用（支持多轮对话历史）
function callAIChat(scenePrompt, messages) {
  return new Promise((resolve, reject) => {
    if (!AI_CONFIG || !AI_CONFIG.api_key || AI_CONFIG.api_key.includes('YOUR-API-KEY')) {
      reject(new Error('请先在 ai_config.json 中配置 API Key'));
      return;
    }

    // 构建完整的 system prompt：通用规则 + 场景设定
    const systemContent = CHAT_SYSTEM_PROMPT + '\n\n【当前场景设定】\n' + scenePrompt;

    // 构建 messages 数组
    const apiMessages = [
      { role: 'system', content: systemContent }
    ];
    // 追加对话历史
    messages.forEach(function(m) {
      apiMessages.push({ role: m.role, content: m.content });
    });

    const body = JSON.stringify({
      model: AI_CONFIG.model || 'gpt-4o-mini',
      messages: apiMessages,
      temperature: 0.6,
      max_tokens: 1024
    });

    const url = new URL(AI_CONFIG.api_base + '/chat/completions');
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_CONFIG.api_key,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        if (resp.statusCode !== 200) {
          reject(new Error('AI API 返回 ' + resp.statusCode + ': ' + data.substring(0, 200)));
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices[0].message.content.trim();
          resolve(parseAIJSON(content));
        } catch (e) {
          reject(new Error(/解析 AI 返回失败/.test(e.message) ? e.message : '解析 AI 返回失败: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('AI API 请求超时')); });
    req.write(body);
    req.end();
  });
}

// 生成音频（异步，不阻塞事件循环）
function generateAudio(text, filepath, voice) {
  return new Promise((resolve, reject) => {
    execFile('edge-tts', [
      '--voice', voice || DEFAULT_VOICE,
      '--text', text,
      '--write-media', filepath
    ], { timeout: 30000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ============================================
// TTS 并发控制
// 限制同时运行的 edge-tts 子进程数量，并对相同文本去重，
// 避免多人/批量同时请求时瞬间拉起大量进程拖垮机器。
// ============================================
const MAX_TTS_CONCURRENCY = 3;
const ttsInflight = Object.create(null); // hash -> Promise
let ttsActive = 0;
const ttsQueue = [];

function pumpTTS() {
  if (ttsActive >= MAX_TTS_CONCURRENCY) return;
  const next = ttsQueue.shift();
  if (!next) return;
  ttsActive++;
  next.job()
    .then(next.resolve, next.reject)
    .finally(function() {
      ttsActive--;
      pumpTTS();
    });
}

function runTTS(job) {
  return new Promise(function(resolve, reject) {
    ttsQueue.push({ job: job, resolve: resolve, reject: reject });
    pumpTTS();
  });
}

function enqueueTTS(hash, task) {
  if (ttsInflight[hash]) return ttsInflight[hash];
  const p = runTTS(task).finally(function() { delete ttsInflight[hash]; });
  ttsInflight[hash] = p;
  return p;
}

// 读取 POST body
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ===== TTS 端点 =====
  if (req.url.startsWith('/tts')) {
    const qIndex = req.url.indexOf('?');
    const qs = new URLSearchParams(qIndex >= 0 ? req.url.substring(qIndex + 1) : '');
    const text = qs.get('text');
    const voice = qs.get('voice') || DEFAULT_VOICE;

    if (!text) {
      res.writeHead(400);
      res.end('Missing text');
      return;
    }

    // 缓存键同时包含文本与嗓音：同一句话换嗓音时各自独立缓存，
    // 否则换嗓音后会命中旧嗓音的缓存文件，导致"换嗓音无效"。
    const hash = crypto.createHash('md5').update(Buffer.from(text + '\u0000' + voice, 'utf-8')).digest('hex');
    const filepath = path.join(AUDIO_DIR, hash + '.mp3');

    if (!fs.existsSync(filepath)) {
      console.log('  🔊 生成:', text.substring(0, 40));
      try {
        await enqueueTTS(hash, function() { return generateAudio(text, filepath, voice); });
      } catch (e) {
        console.log('  ❌ 失败:', e.message.substring(0, 80));
        res.writeHead(500);
        res.end('TTS failed');
        return;
      }
    }

    if (fs.existsSync(filepath)) {
      const stat = fs.statSync(filepath);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=31536000'
      });
      fs.createReadStream(filepath).pipe(res);
    } else {
      res.writeHead(500);
      res.end('File not found');
    }
    return;
  }

  // ===== AI 拆解端点 =====
  if (req.url === '/ai' && req.method === 'POST') {
    try {
      const bodyStr = await readBody(req);
      const { text } = JSON.parse(bodyStr);

      if (!text) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: '请输入中文句子' }));
        return;
      }

      console.log('  🤖 AI 拆解:', text.substring(0, 40));
      let result = null, lastErr = null;
      // agnes-2.5-flash 偶发超时/空内容/socket 中断，自动重试一次
      for (let attempt = 1; attempt <= 2 && !result; attempt++) {
        try { result = await callAI(text); }
        catch (e) { lastErr = e; console.log('  ⚠️ AI 第 ' + attempt + ' 次失败: ' + e.message.substring(0, 60)); }
      }
      if (!result) throw lastErr;
      console.log('  ✅ AI 返回成功');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      console.log('  ❌ AI 失败:', e.message.substring(0, 100));
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ===== AI 情景对话端点 =====
  if (req.url === '/ai/chat' && req.method === 'POST') {
    try {
      const bodyStr = await readBody(req);
      const { scene, messages } = JSON.parse(bodyStr);

      if (!scene) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: '缺少场景设定' }));
        return;
      }
      if (!messages || !Array.isArray(messages)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: '缺少对话历史' }));
        return;
      }

      console.log('  💬 AI 对话:', scene.substring(0, 30), '| 轮次:', messages.length);
      let result = null, lastErr = null;
      for (let attempt = 1; attempt <= 2 && !result; attempt++) {
        try { result = await callAIChat(scene, messages); }
        catch (e) { lastErr = e; console.log('  ⚠️ AI 对话第 ' + attempt + ' 次失败: ' + e.message.substring(0, 60)); }
      }
      if (!result) throw lastErr;
      console.log('  ✅ AI 对话返回:', result.kr ? result.kr.substring(0, 30) : '?');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      console.log('  ❌ AI 对话失败:', e.message.substring(0, 100));
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ===== AI 配置检测端点 =====
  if (req.url === '/ai/status') {
    const configured = AI_CONFIG && AI_CONFIG.api_key && !AI_CONFIG.api_key.includes('YOUR-API-KEY');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      configured: !!configured,
      model: AI_CONFIG ? AI_CONFIG.model : null
    }));
    return;
  }

  // ===== Health Check =====
  if (req.url === '/health') {
    const mp3s = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', voice: DEFAULT_VOICE, cached: mp3s.length }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('🇰🇷 TTS + AI Server running on http://localhost:' + PORT);
  console.log('🎤 Voice: ' + DEFAULT_VOICE);
  if (AI_CONFIG && AI_CONFIG.api_key && !AI_CONFIG.api_key.includes('YOUR-API-KEY')) {
    console.log('🤖 AI Model: ' + (AI_CONFIG.model || 'gpt-4o-mini'));
  } else {
    console.log('⚠️  AI 未配置，请编辑 ai_config.json');
  }
});
