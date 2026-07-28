// functions/tts/index.js — TTS 语音合成代理
// 把本地 edge-tts 的能力搬到云端，API 格式完全兼容（/tts?text=...&voice=...）

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const text = url.searchParams.get('text');
  const voice = url.searchParams.get('voice') || env.TTS_DEFAULT_VOICE || 'ko-KR-SunHiNeural';

  if (!text) {
    return new Response('Missing text parameter', { status: 400 });
  }

  // === 优先方案：Google Cloud TTS（需配置 GOOGLE_TTS_API_KEY）===
  if (env.GOOGLE_TTS_API_KEY) {
    try {
      // Google Cloud TTS 支持 ko-KR 多种 Neural2 嗓音
      const gVoice = voice
        .replace('ko-KR-SunHiNeural', 'ko-KR-Neural2-C')
        .replace('ko-KR-', 'ko-KR-');
      
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
        return new Response(audioBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=31536000',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    } catch (e) {
      console.error('Google TTS failed:', e);
      // 继续尝试下一个方案
    }
  }

  // === 备选方案：Azure Cognitive Services TTS（需配置 AZURE_TTS_KEY + AZURE_TTS_REGION）===
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
        return new Response(resp.body, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=31536000',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    } catch (e) {
      console.error('Azure TTS failed:', e);
    }
  }

  // === 最终备选：浏览器 Web Speech API（返回提示，前端降级）===
  return new Response(JSON.stringify({
    error: 'TTS server not configured',
    hint: 'Set GOOGLE_TTS_API_KEY or AZURE_TTS_KEY+AZURE_TTS_REGION env vars',
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
