#!/usr/bin/env python3
"""
Basic Korean Audio Generator
使用 Edge TTS (Microsoft) 批量生成所有韩语音频
支持声音: ko-KR-SunHiNeural (女声) / ko-KR-InJoonNeural (男声) / ko-KR-HyunsuMultilingualNeural
"""

import os, json, re, hashlib, subprocess, sys, time

# ============ 配置 ============
VOICE = "ko-KR-SunHiNeural"
# VOICE = "ko-KR-InJoonNeural"  # 男声（需要时取消注释）
# VOICE = "ko-KR-HyunsuMultilingualNeural"  # 多语言版

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

# ============ 提取所有韩语文本 ============
def extract_texts():
    texts = set()
    js_dir = os.path.join(os.path.dirname(__file__), "js")
    
    # 从 sentences_data.js 提取
    with open(os.path.join(js_dir, "sentences_data.js"), "r", encoding="utf-8") as f:
        content = f.read()
    for m in re.finditer(r'kr:\s*"([^"]+)"', content):
        texts.add(m.group(1))
    
    # 从 stems_data.js 提取
    with open(os.path.join(js_dir, "stems_data.js"), "r", encoding="utf-8") as f:
        content = f.read()
    for m in re.finditer(r'example:\s*"([^"]+)"', content):
        texts.add(m.group(1))
    for m in re.finditer(r'stem:\s*"([^"]+)"', content):
        texts.add(m.group(1))
    
    # 从 rules_data.js 提取（例句中的韩文）
    with open(os.path.join(js_dir, "rules_data.js"), "r", encoding="utf-8") as f:
        content = f.read()
    for m in re.finditer(r'kr:\s*"([^"]+)"', content):
        texts.add(m.group(1))
    
    # 从 reference_data.js 提取
    with open(os.path.join(js_dir, "reference_data.js"), "r", encoding="utf-8") as f:
        content = f.read()
    for m in re.finditer(r'example:\s*"([^"]+)"', content):
        texts.add(m.group(1))
    for m in re.finditer(r'word:\s*"([^"]+)"', content):
        texts.add(m.group(1))
    
    print(f"📝 共提取 {len(texts)} 条韩语文本")
    return sorted(texts)

# ============ 批量生成音频 ============
def generate_audio(texts):
    total = len(texts)
    existing = 0
    new_gen = 0
    
    for i, text in enumerate(texts, 1):
        # 用 hash 作为文件名（避免特殊字符问题）
        file_hash = hashlib.md5(text.encode()).hexdigest()
        filename = f"{file_hash}.mp3"
        filepath = os.path.join(AUDIO_DIR, filename)
        
        # 如果文件已存在则跳过
        if os.path.exists(filepath) and os.path.getsize(filepath) > 1000:
            existing += 1
        else:
            print(f"  [{i}/{total}] 🔊 生成: {text[:30]}{'...' if len(text) > 30 else ''}")
            result = subprocess.run(
                ["edge-tts", "--voice", VOICE, "--text", text, "--write-media", filepath],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                new_gen += 1
            else:
                print(f"  ❌ 失败: {text} - {result.stderr[:100]}")
        
        # 每 10 条显示进度
        if i % 10 == 0 or i == total:
            print(f"  📊 进度: {i}/{total} ({existing} 已有 + {new_gen} 新增)")
    
    print(f"\n✅ 完成！共有 {total} 条音频")
    print(f"   📁 目录: {AUDIO_DIR}")
    print(f"   🔊 语音: {VOICE}")
    
    # 生成映射文件（文本 → 文件名）
    mapping = {}
    for text in texts:
        file_hash = hashlib.md5(text.encode()).hexdigest()
        mapping[text] = f"{file_hash}.mp3"
    
    map_path = os.path.join(AUDIO_DIR, "audio_map.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"   📋 映射文件: {map_path}")
    
    return mapping

# ============ 更新 app.js 使用本地音频 ============
def update_app_js():
    js_path = os.path.join(os.path.dirname(__file__), "js", "app.js")
    
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # 替换 playBtn 使用本地音频
    old_play = """function playBtn(text, size) {
  var sizeStyle = size === "small" ? "font-size:14px;padding:2px 8px;" : "font-size:16px;padding:4px 12px;";
  var encoded = encodeURIComponent(text);
  return '<button class="korean-speak-btn" data-text="' + encoded + '" style="' + sizeStyle + 'background:var(--primary);color:white;border:none;border-radius:6px;cursor:pointer;margin-left:8px;vertical-align:middle;line-height:1.4;font-family:inherit;" title="点击播放韩语发音">\\u{1F50A}</button>';
}"""
    
    new_play = """function playBtn(text, size) {
  var sizeStyle = size === "small" ? "font-size:14px;padding:2px 8px;" : "font-size:16px;padding:4px 12px;";
  var encoded = encodeURIComponent(text);
  return '<button class="korean-speak-btn" data-text="' + encoded + '" style="' + sizeStyle + 'background:var(--primary);color:white;border:none;border-radius:6px;cursor:pointer;margin-left:8px;vertical-align:middle;line-height:1.4;font-family:inherit;" title="点击播放韩语发音">🔊</button>';
}"""
    
    content = content.replace(old_play, new_play)
    
    # 替换 speakKorean 使用本地音频播放
    old_speak = """function speakKorean(text) {
  // 停止任何正在播放的语音
  window.speechSynthesis.cancel();
  
  // 创建一个新的语音实例
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 0.9;    // 语速稍慢，适合学习
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  
  // 尝试选择韩语语音
  const voices = window.speechSynthesis.getVoices();
  const koreanVoice = voices.find(v => v.lang.startsWith("ko"));
  if (koreanVoice) {
    utterance.voice = koreanVoice;
  }
  
  window.speechSynthesis.speak(utterance);
}

// 预加载语音列表（Chrome 需要异步加载）
if (typeof window !== "undefined") {
  window.speechSynthesis.getVoices(); // 触发预加载
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}"""
    
    new_speak = """// 音频文件映射
var audioMap = {};
var audioLoaded = false;

// 加载音频映射
function loadAudioMap() {
  if (audioLoaded) return;
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "audio/audio_map.json", false);
  xhr.onload = function() {
    if (xhr.status === 200) {
      audioMap = JSON.parse(xhr.responseText);
      audioLoaded = true;
    }
  };
  xhr.send();
}

function speakKorean(text) {
  loadAudioMap();
  var filename = audioMap[text];
  if (filename) {
    var audio = new Audio("audio/" + filename);
    audio.play();
  }
}"""
    
    content = content.replace(old_speak, new_speak)
    
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    print("✅ app.js 已更新为使用本地音频文件")

# ============ 主流程 ============
if __name__ == "__main__":
    print("=" * 50)
    print("🇰🇷 Basic Korean 音频批量生成器")
    print("=" * 50)
    print(f"🎤 语音: {VOICE}")
    print(f"📁 输出: {AUDIO_DIR}")
    print()
    
    texts = extract_texts()
    
    print("\n🔊 开始生成音频...")
    generate_audio(texts)
    
    print("\n🔄 更新 app.js...")
    update_app_js()
    
    print("\n🎉 全部完成！")
    print(f"   音频文件位置: {AUDIO_DIR}/")
    print(f"   共生成 {len(texts)} 个音频文件")
