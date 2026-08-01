// functions/tts/index.js — TTS 语音合成代理（四级回退）
// API 格式完全兼容（/tts?text=...&voice=...），前端 speakKorean 零改动。
// 优先级：Google Cloud TTS → Azure TTS → Edge 免费 TTS（需 EDGE_TTS_ENABLED=1）→ 503 + 浏览器降级提示。
//
// Edge 免费分支：协议逆向自 node-edge-tts（MIT），已在本地 workerd + 远程数据中心双端实测
// （完整韩语合成返回有效 MP3）。两个关键点：
//   1. `new WebSocket(url)` 无法自定义握手头（Origin/User-Agent），微软端点会拒绝；
//      必须用 `fetch(url, { headers: { Upgrade: "websocket", ... } })` 发起握手。
//   2. fetch Upgrade 返回的 socket 是 WebSocketPair 的 server 端：必须先 `ws.accept()` 才能收发，
//      `open` 事件不会触发（readyState 已为 1），须直接检查 readyState 发送。

const DEFAULT_VOICE = 'ko-KR-SunHiNeural';

// === Edge 免费 TTS 协议常量 ===
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const WINDOWS_FILE_TIME_EPOCH = 11644473600; // Unix→Windows 1601 纪元秒偏移
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const EDGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "Pragma": "no-cache",
  "Cache-Control": "no-cache"
};
// Edge 端点没有的嗓音 → 映射到可用嗓音（SunHi/InJoon 是 Edge 原生嗓音，直接透传）
const EDGE_VOICE_MAP = {
  'ko-KR-HyunsuMultilingualNeural': 'ko-KR-SunHiNeural'
};

// Sec-MS-GEC = SHA256(roundedTicks + TRUSTED_CLIENT_TOKEN) 大写十六进制
async function generateSecMsGecToken() {
  const ticks = BigInt(Math.floor(Date.now() / 1000 + WINDOWS_FILE_TIME_EPOCH)) * 10000000n;
  const rounded = ticks - (ticks % 3000000000n); // 向下取整到 3e9（约 5 分钟）窗口
  const strToHash = `${rounded}${TRUSTED_CLIENT_TOKEN}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(strToHash));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function escapeXml(s) {
  return s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomBase64Key() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

// === Edge 免费 TTS 合成（返回 Uint8Array，失败抛错）===
async function synthesizeEdge(text, rawVoice) {
  const voice = EDGE_VOICE_MAP[rawVoice] || rawVoice;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 20000);
  let ws = null;
  try {
    const token = await generateSecMsGecToken();
    const wsUrl =
      "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
      `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${token}` +
      `&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`;

    // 关键：用 fetch() 发起 WS Upgrade，从而携带自定义 Origin/User-Agent 头
    const resp = await fetch(wsUrl, {
      headers: {
        ...EDGE_HEADERS,
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBase64Key()
      },
      signal: ctrl.signal
    });
    clearTimeout(timeout); // fetch 阶段结束，WS 阶段由下方 t2 定时器接管
    if (!resp.webSocket) {
      throw new Error("edge-tts upgrade rejected: " + resp.status);
    }
    ws = resp.webSocket;
    // 关键：fetch Upgrade 的 socket 是 WebSocketPair server 端，必须先 accept() 才能收发
    ws.accept();
    ws.binaryType = "arraybuffer"; // 必须：二进制帧否则以 Blob 形式到达

    const audioChunks = [];
    const decoder = new TextDecoder();
    const headerBytes = new TextEncoder().encode("Path:audio\r\n");
    let sent = false;
    const sendInit = () => {
      if (sent) return;
      sent = true;
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"${OUTPUT_FORMAT}"}}}}`
      );
      const requestId = randomHex(16);
      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ko-KR">` +
        `<voice name="${voice}"><prosody rate="default" pitch="default" volume="default">${escapeXml(text)}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
    };

    await new Promise((resolve, reject) => {
      const t2 = setTimeout(() => {
        try { ws.close(); } catch (e) {}
        reject(new Error("edge-tts timeout (20s)"));
      }, 20000);

      // open 事件在 fetch-upgrade socket 上不会触发，但注册无妨；readyState===1 直接发送
      ws.addEventListener("open", sendInit);
      if (ws.readyState === 1) sendInit();

      ws.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          if (event.data.includes("Path:turn.end")) {
            clearTimeout(t2);
            try { ws.close(); } catch (e) {}
            resolve();
          }
          return;
        }
        // 二进制帧：可能是「Path:audio\r\n + 音频数据」混合包
        const bytes = new Uint8Array(event.data);
        let start = 0;
        if (bytes.length > headerBytes.length) {
          const head = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 256)));
          const idx = head.indexOf("Path:audio\r\n");
          if (idx !== -1) start = idx + headerBytes.length;
        }
        if (start < bytes.length) audioChunks.push(bytes.subarray(start));
      });

      ws.addEventListener("error", () => {
        clearTimeout(t2);
        try { ws.close(); } catch (e) {}
        reject(new Error("edge-tts websocket error"));
      });

      ws.addEventListener("close", () => {
        clearTimeout(t2);
        if (audioChunks.length === 0) {
          reject(new Error("edge-tts closed before audio"));
        } else {
          resolve(); // 音频已收全（可能未等到 turn.end 即关闭），视为成功终态
        }
      });
    });

    if (audioChunks.length === 0) throw new Error("edge-tts no audio received");
    const total = audioChunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of audioChunks) { out.set(c, off); off += c.length; }
    return out;
  } catch (e) {
    clearTimeout(timeout);
    if (ws) { try { ws.close(); } catch (e2) {} }
    throw e;
  }
}

const AUDIO_HEADERS = {
  'Content-Type': 'audio/mpeg',
  'Cache-Control': 'public, max-age=31536000',
  'Access-Control-Allow-Origin': '*'
};

// P1-9 服务端音频缓存（Cache API，同 text+voice 幂等命中直接返回，减少 Edge/付费端点调用）
// 键：text+voice 的稳定 URL（query 顺序固定），命中即返回缓存音频。
// 注意：必须在调用处内联 context.waitUntil(...)，不可把方法脱离 this 传递。
async function ttsCachePut(key, resp, context) {
  try {
    const clone = resp.clone();
    context.waitUntil(caches.default.put(key, clone));
  } catch (e) { /* 缓存失败不影响主流程 */ }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const text = url.searchParams.get('text');
  const voice = url.searchParams.get('voice') || env.TTS_DEFAULT_VOICE || DEFAULT_VOICE;

  if (!text) {
    return new Response('Missing text parameter', { status: 400 });
  }
  // 白名单校验：voice 会拼入 SSML（Azure/Edge），防注入
  if (!/^[A-Za-z0-9-]+$/.test(voice)) {
    return new Response('Invalid voice', { status: 400 });
  }

  // === P1-9 缓存层：同 text+voice 命中直接返回 ===
  // 缓存键 = 请求 URL 本身（text/voice 已编码进 query，同一请求天然幂等）
  const cacheReq = new Request(request.url, { method: "GET" });
  try {
    const hit = await caches.default.match(cacheReq);
    if (hit && hit.ok) return hit;
  } catch (e) {}

  // === 1) 优先方案：Google Cloud TTS（需配置 GOOGLE_TTS_API_KEY）===
  if (env.GOOGLE_TTS_API_KEY) {
    try {
      // Google Cloud TTS 支持 ko-KR 多种 Neural2 嗓音
      const gVoice = voice.replace('ko-KR-SunHiNeural', 'ko-KR-Neural2-C');

      const resp = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GOOGLE_TTS_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: text },
            voice: { languageCode: 'ko-KR', name: gVoice },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 }
          })
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        const audioContent = data.audioContent; // base64
        const audioBuffer = Uint8Array.from(atob(audioContent), c => c.charCodeAt(0));
        const out = new Response(audioBuffer, { status: 200, headers: AUDIO_HEADERS });
        await ttsCachePut(cacheReq, out, context);
        return out;
      }
    } catch (e) {
      console.error('Google TTS failed:', e);
      // 继续尝试下一个方案
    }
  }

  // === 2) 备选方案：Azure Cognitive Services TTS（需配置 AZURE_TTS_KEY + AZURE_TTS_REGION）===
  if (env.AZURE_TTS_KEY && env.AZURE_TTS_REGION) {
    try {
      const ssml = `\
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ko-KR">
  <voice name="${voice}">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</voice>
</speak>`;

      const resp = await fetch(
        `https://${env.AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': env.AZURE_TTS_KEY,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3'
          },
          body: ssml
        }
      );

      if (resp.ok) {
        const out = new Response(resp.body, { status: 200, headers: AUDIO_HEADERS });
        await ttsCachePut(cacheReq, out, context);
        return out;
      }
    } catch (e) {
      console.error('Azure TTS failed:', e);
    }
  }

  // === 3) 免费方案：Edge TTS（需 EDGE_TTS_ENABLED=1）===
  // 注意：Edge 端点无 SLA、可能随时变更，故需显式开关启用。
  // 文本超长会跑满 WS 超时，跳过 Edge 直接降级，避免白耗连接。
  if (env.EDGE_TTS_ENABLED && text.length <= 500) {
    try {
      const audio = await synthesizeEdge(text, voice);
      const out = new Response(audio, { status: 200, headers: AUDIO_HEADERS });
      await ttsCachePut(cacheReq, out, context);
      return out;
    } catch (e) {
      console.error('Edge TTS failed:', e.message);
      // 落入最终降级
    }
  }

  // === 4) 最终降级：浏览器 Web Speech API（返回提示，前端降级）===
  return new Response(JSON.stringify({
    error: 'TTS server not configured',
    hint: 'Set GOOGLE_TTS_API_KEY, AZURE_TTS_KEY+AZURE_TTS_REGION, or EDGE_TTS_ENABLED=1 env vars',
    fallback: 'browser-speech-api'
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// 处理 OPTIONS 预检请求
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
  });
}
