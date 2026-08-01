// functions/tts-edge-debug/index.js — 隔离实验：区分「运行时 WebSocket 客户端问题」vs「微软拒绝握手」
// 路由（index.js 只匹配精确路径 /tts-edge-debug，子路径需 [[path]] 文件，故用查询参数）：
//   GET /tts-edge-debug?probe=echo  → 连公共 echo 服务器，验证 workerd 出站 WS 可用性
//   GET /tts-edge-debug?probe=edge  → 连 Edge TTS 端点，捕获 close code/reason
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WINDOWS_FILE_TIME_EPOCH = 11644473600;

async function generateSecMsGecToken() {
  const ticks = BigInt(Math.floor(Date.now() / 1000 + WINDOWS_FILE_TIME_EPOCH)) * 10000000n;
  const rounded = ticks - (ticks % 3000000000n);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${rounded}${TRUSTED_CLIENT_TOKEN}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function wsProbe(url, onOpen, timeoutMs = 15000) {
  return await new Promise((resolve) => {
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      resolve({ stage: "constructor-threw", error: String(e) });
      return;
    }
    ws.binaryType = "arraybuffer";
    const timer = setTimeout(() => {
      try { ws.close(); } catch (e) {}
      resolve({ stage: "timeout", state: ws.readyState });
    }, timeoutMs);
    ws.addEventListener("open", () => {
      try { onOpen(ws); } catch (e) { resolve({ stage: "onOpen-threw", error: String(e) }); }
    });
    ws.addEventListener("message", (ev) => {
      clearTimeout(timer);
      const isStr = typeof ev.data === "string";
      const data = isStr ? ev.data : `[binary ${new Uint8Array(ev.data).length} bytes]`;
      resolve({ stage: "message", isString: isStr, data: isStr ? data.slice(0, 300) : data, readyState: ws.readyState });
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      resolve({ stage: "error", readyState: ws.readyState });
    });
    ws.addEventListener("close", (ev) => {
      clearTimeout(timer);
      resolve({ stage: "close", code: ev.code, reason: ev.reason || "", readyState: ws.readyState });
    });
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const probe = url.searchParams.get("probe");

  if (probe === "echo") {
    const r = await wsProbe("wss://ws.postman-echo.com/raw", (ws) => ws.send("hello-from-worker"));
    return new Response(JSON.stringify({ probe: "echo", result: r }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  if (probe === "fetch-edge") {
    // 关键变数：Workers 的 fetch() 是否支持 WebSocket Upgrade + 自定义头？
    // 若支持，就能携带微软要求的 Origin/User-Agent，路径 A 从“不可行”变“可行”。
    const token = await generateSecMsGecToken();
    const wsUrl =
      "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
      `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${token}` +
      `&Sec-MS-GEC-Version=1-143.0.3650.75`;
    try {
      const resp = await fetch(wsUrl, {
        headers: {
          "Upgrade": "websocket",
          "Connection": "Upgrade",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
          "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
        }
      });
      const hasSocket = !!resp.webSocket;
      return new Response(JSON.stringify({ probe: "fetch-edge", ok: resp.ok, status: resp.status, hasSocket }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ probe: "fetch-edge", fetchError: String(e) }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }

  if (probe === "upgrade-send") {
    // 验证：fetch 升级后 open 事件是否触发？不依赖 open 直接 send 是否可行？服务端是否响应？
    const token = await generateSecMsGecToken();
    const wsUrl =
      "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
      `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${token}` +
      `&Sec-MS-GEC-Version=1-143.0.3650.75`;
    try {
      const resp = await fetch(wsUrl, {
        headers: {
          "Upgrade": "websocket",
          "Connection": "Upgrade",
          "Sec-WebSocket-Version": "13",
          "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
        }
      });
      if (!resp.webSocket) return new Response(JSON.stringify({ error: "no socket", status: resp.status }), { status: 502, headers: { "Content-Type": "application/json" } });
      const ws = resp.webSocket;
      // 关键：fetch Upgrade 返回的 socket 是 WebSocketPair 的 server 端，必须先 accept() 才能收发
      const events = [];
      try { ws.accept(); events.push("accepted"); } catch (e) { events.push("accept-failed:" + e.message); }
      ws.binaryType = "arraybuffer";
      let opened = false;
      ws.addEventListener("open", () => { opened = true; events.push("open-event"); });
      ws.addEventListener("message", (ev) => {
        events.push(typeof ev.data === "string" ? "text:" + ev.data.slice(0, 60) : "binary:" + new Uint8Array(ev.data).length + "b");
      });
      ws.addEventListener("error", () => events.push("error-event"));
      ws.addEventListener("close", (ev) => events.push("close-event code=" + ev.code));
      await new Promise(r => setTimeout(r, 500));
      events.push("after500ms readyState=" + ws.readyState + " opened=" + opened);
      // 无论 open 事件是否触发，直接发送
      ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
      events.push("sent-config");
      ws.send(`X-RequestId:${randomHex(16)}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ko-KR"><voice name="ko-KR-SunHiNeural"><prosody rate="default" pitch="default" volume="default">안녕하세요</prosody></voice></speak>`);
      events.push("sent-ssml");
      await new Promise(r => setTimeout(r, 8000));
      try { ws.close(); } catch (e) {}
      return new Response(JSON.stringify({ probe: "upgrade-send", events }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ probe: "upgrade-send", fetchError: String(e) }), { headers: { "Content-Type": "application/json" } });
    }
  }

  if (probe === "edge") {
    const token = await generateSecMsGecToken();
    const wsUrl =
      "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
      `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${token}` +
      `&Sec-MS-GEC-Version=1-143.0.3650.75`;
    const r = await wsProbe(wsUrl, (ws) => {
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      );
    }, 20000);
    return new Response(JSON.stringify({ probe: "edge-handshake", result: r, wsUrl: wsUrl.replace(TRUSTED_CLIENT_TOKEN, "***") }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  return new Response("unknown probe: use ?probe=echo|edge", { status: 400 });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
}
