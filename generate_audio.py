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
        # 用 hash(文本+嗓音) 作为文件名，与 tts_server.js 的缓存键一致
        file_hash = hashlib.md5((text + "\u0000" + VOICE).encode()).hexdigest()
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
        file_hash = hashlib.md5((text + "\u0000" + VOICE).encode()).hexdigest()
        mapping[text] = f"{file_hash}.mp3"
    
    map_path = os.path.join(AUDIO_DIR, "audio_map.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"   📋 映射文件: {map_path}")
    
    return mapping

# ============ 说明：不再改写 app.js ============
# 历史上此脚本会就地重写 js/app.js，把播放逻辑从"走 TTS 服务器"改成"读本地
# audio_map.json"。这种做法有副作用：一旦 app.js 被手改，替换会静默失效，且破坏了
# 默认的"走服务器"行为。现保留为无副作用——播放始终由前端通过 TTS 服务器完成，
# 预生成音频仅作为可选离线缓存。
def update_app_js():
    print("ℹ️  跳过改写 app.js：播放继续走 TTS 服务器，预生成音频仅作离线缓存。")

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

    print("\n🔄 说明：播放仍走 TTS 服务器（js/app.js 不被本脚本修改）。")
    print("   预生成音频仅作为离线缓存，可选；如需使用需另行在 app.js 中接入 audio_map.json。")

    print("\n🎉 全部完成！")
    print(f"   音频文件位置: {AUDIO_DIR}/")
    print(f"   共生成 {len(texts)} 个音频文件")
