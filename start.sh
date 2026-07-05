#!/bin/bash
# Basic Korean Web - 一键启动脚本
# 启动 Web 服务器(9999) + TTS 服务器(1234) 并打开浏览器

cd "$(dirname "$0")"

echo "🇰🇷 Basic Korean Web 启动中..."

# 检查 edge-tts 是否安装
if ! command -v edge-tts &> /dev/null; then
  echo "❌ edge-tts 未安装，正在安装..."
  pip3 install edge-tts
fi

# 检查 node 是否安装
if ! command -v node &> /dev/null; then
  echo "❌ Node.js 未安装，请先安装 Node.js"
  exit 1
fi

# 启动 TTS 服务器
echo "🔊 启动 TTS + AI 服务器 (端口 1234)..."
node tts_server.js &
TTS_PID=$!

# 启动 Web 服务器
echo "🌐 启动 Web 服务器 (端口 9999)..."
node web_server.js &
WEB_PID=$!

# 等待服务启动
sleep 1

# 打开浏览器
echo "🌍 打开浏览器..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  open http://localhost:9999
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  xdg-open http://localhost:9999
fi

echo ""
echo "✅ 服务已启动！"
echo "   🌐 网页: http://localhost:9999"
echo "   🔊 TTS + AI: http://localhost:1234"
echo ""
echo "🤖 AI 练句功能："
echo "   编辑 ai_config.json 填入 API Key 后即可使用"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获退出信号，清理子进程
trap "kill $TTS_PID $WEB_PID 2>/dev/null; exit" SIGINT SIGTERM

# 等待子进程
wait
