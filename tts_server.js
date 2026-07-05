const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.join(__dirname, 'audio');
const VOICE = 'ko-KR-SunHiNeural';
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
}`;

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
- 词尾的 label 是其功能`;

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
      max_tokens: 2000
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
          const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
          resolve(JSON.parse(cleaned));
        } catch (e) {
          reject(new Error('解析 AI 返回失败: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('AI API 请求超时')); });
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
      max_tokens: 800
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
          const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
          resolve(JSON.parse(cleaned));
        } catch (e) {
          reject(new Error('解析 AI 返回失败: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('AI API 请求超时')); });
    req.write(body);
    req.end();
  });
}

// 生成音频（异步，不阻塞事件循环）
function generateAudio(text, filepath) {
  return new Promise((resolve, reject) => {
    execFile('edge-tts', [
      '--voice', VOICE,
      '--text', text,
      '--write-media', filepath
    ], { timeout: 30000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
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

    if (!text) {
      res.writeHead(400);
      res.end('Missing text');
      return;
    }

    const hash = crypto.createHash('md5').update(Buffer.from(text, 'utf-8')).digest('hex');
    const filepath = path.join(AUDIO_DIR, hash + '.mp3');

    if (!fs.existsSync(filepath)) {
      console.log('  🔊 生成:', text.substring(0, 40));
      try {
        await generateAudio(text, filepath);
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
      const result = await callAI(text);
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
      const result = await callAIChat(scene, messages);
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
    res.end(JSON.stringify({ status: 'ok', voice: VOICE, cached: mp3s.length }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🇰🇷 TTS + AI Server running on http://localhost:' + PORT);
  console.log('🎤 Voice: ' + VOICE);
  if (AI_CONFIG && AI_CONFIG.api_key && !AI_CONFIG.api_key.includes('YOUR-API-KEY')) {
    console.log('🤖 AI Model: ' + (AI_CONFIG.model || 'gpt-4o-mini'));
  } else {
    console.log('⚠️  AI 未配置，请编辑 ai_config.json');
  }
});
