// functions/tts-edge/index.js — 实验：在 Cloudflare Worker 中复刻 Edge 免费 TTS 协议
// 协议逻辑逆向自 node-edge-tts（MIT），改用 Workers 原生 API 实现，不依赖 node:ws / node:crypto。
//
// 关键点（本实验的核心发现）：
//   1. `new WebSocket(url)` 在 Workers 中无法自定义握手头（Origin/User-Agent），微软端点会拒绝；
//      改用 `fetch(url, { headers: { Upgrade: "websocket", ... } })` 发起握手可携带自定义头，
//      微软端点返回 101 Switching Protocols 且 `resp.webSocket` 可用 —— 路径 A 由此可行。
//   2. fetch Upgrade 返回的 socket 是 WebSocketPair 的 server 端：必须先 `ws.accept()` 才能收发；
//      `open` 事件不会触发（readyState 已为 1），必须直接检查 readyState 发送消息。
//
// 目的：验证「Edge 免费 TTS 协议能否在 Worker 中运行」及「数据中心 IP 是否会被风控」。
// 路由：GET /tts-edge?text=안녕하세요&voice=ko-KR-SunHiNeural
// 注意：这是实验代码，非生产依赖（微软该端点无 SLA、可能随时变更）。

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const WINDOWS_FILE_TIME_EPOCH = 11644473600; // Unix→Windows 1601 纪元秒偏移
const DEFAULT_VOICE = "ko-KR-SunHiNeural";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
// 与 node-edge-tts 一致的浏览器指纹头（微软端点校验 Origin/UA）
const EDGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "Pragma": "no-cache",
  "Cache-Control": "no-cache"
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

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const text = url.searchParams.get("text");
  const voice = url.searchParams.get("voice") || DEFAULT_VOICE;
  if (!text) return new Response("Missing text parameter", { status: 400 });
  if (text.length > 500) return new Response("Text too long", { status: 413 });
  // 白名单校验：voice 会拼入 SSML，防注入（仅允许 [A-Za-z0-9-]）
  if (!/^[A-Za-z0-9-]+$/.test(voice)) {
    return new Response("Invalid voice", { status: 400 });
  }

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
    // （Sec-WebSocket-Key 用随机 base64，与实证成功的 fetch-edge 探针一致）
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
      return new Response(JSON.stringify({ error: "upgrade rejected", status: resp.status }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    ws = resp.webSocket;
    // 关键：fetch Upgrade 的 socket 是 WebSocketPair server 端，必须先 accept() 才能收发；
    // 且 open 事件不会触发（readyState 已为 1），须直接发送。
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

    if (audioChunks.length === 0) {
      return new Response(JSON.stringify({ error: "no audio received" }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    const total = audioChunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of audioChunks) { out.set(c, off); off += c.length; }
    return new Response(out, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    clearTimeout(timeout);
    if (ws) { try { ws.close(); } catch (e2) {} }
    return new Response(JSON.stringify({ error: "edge-tts failed: " + e.message }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
