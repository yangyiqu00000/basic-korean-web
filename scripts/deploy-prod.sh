#!/bin/bash
# scripts/deploy-prod.sh — 一键部署到 Cloudflare Pages 生产分支 + 内置部署后验证矩阵
#
# 为什么需要它（背景）：Cloudflare Pages 的 Secrets（AI_API_KEY / EDGE_TTS_ENABLED 等）
# 只挂在**生产环境**。不带 --branch 部署时 wrangler 默认用当前 git 分支 → 落到 Preview 环境：
# /ai/status 返回 configured:false、/tts 走不到 Edge 免费回退直接 503——「在线但功能缺失」，
# 且 Preview 与正式域名分离，极难察觉。本脚本强制 `--branch <生产分支>`（默认 main）
# 部署到生产环境，并以验证矩阵兜底确认四件事：
#   ① /tts 200 + audio/mpeg    —— Edge 免费回退真实合成（非 503 浏览器降级）
#   ② 首页 HTML 无 unpkg.com   —— Vue 本地化未回退 CDN
#   ③ 首页版本戳 = 本地 index.html 版本戳 —— 未命中旧 CDN 缓存 / 未部署错目录
#   ④ /ai/status 重试至 200 且 configured:true —— Secrets 已生效，非 Preview 空环境
#
# 生产分支自动检测：优先读 .github/workflows/deploy.yml 中 deploy 步骤的 `--branch`；
#   兜底 git origin/HEAD → 再兜底 main。项目名 / Account ID 同样从 workflow 检测。
#
# 用法：
#   bash scripts/deploy-prod.sh                          # 检测 → 部署 → 验证
#   DEPLOY_URL=https://your.domain bash scripts/deploy-prod.sh   # 验证自定义域名
#   SKIP_DEPLOY=1 bash scripts/deploy-prod.sh            # 只跑验证矩阵（线上复查，不部署）
#   BRANCH=my-branch bash scripts/deploy-prod.sh         # 覆盖部署分支（默认检测=main，不推荐）
#
# 依赖：本地 wrangler（devDependencies）+ CLOUDFLARE_API_TOKEN（或 CLOUDFLARE_API_KEY）；
#   两者皆缺时自动回退本机 wrangler OAuth 登录（见下方凭据检查）。

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WORKFLOW=".github/workflows/deploy.yml"
PASS=0
FAIL=0
pass() { PASS=$((PASS+1)); echo -e "  \033[0;32m✅ PASS\033[0m $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  \033[0;31m❌ FAIL\033[0m $1"; }
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

command -v curl >/dev/null 2>&1 || { echo "❌ 缺少 curl"; exit 1; }
command -v npx  >/dev/null 2>&1 || { echo "❌ 缺少 npx（Node.js 未安装）"; exit 1; }

# ---------- 1) 自动检测生产分支 / 项目名 / Account ID（从 CI workflow 提取，与 CI 保持一致） ----------
PROD_BRANCH=""
PROJECT_NAME=""
ACCOUNT_ID=""
if [ -f "$WORKFLOW" ]; then
  PROD_BRANCH="$(grep -oE '\-\-branch [A-Za-z0-9._-]+' "$WORKFLOW" | head -1 | awk '{print $2}')"
  PROJECT_NAME="$(grep -oE '\-\-project-name [A-Za-z0-9._-]+' "$WORKFLOW" | head -1 | awk '{print $2}')"
  ACCOUNT_ID="$(grep -oE 'accountId: [A-Za-z0-9]+' "$WORKFLOW" | head -1 | awk '{print $2}')"
fi
if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME="$(grep -m1 -E '^name *=' wrangler.toml | sed -E 's/^name *= *"([^"]+)".*/\1/')"
fi
if [ -z "$PROJECT_NAME" ]; then
  echo "❌ 无法确定 Pages 项目名（$WORKFLOW 与 wrangler.toml 均未提供），请检查配置。"
  exit 1
fi
if [ -z "$PROD_BRANCH" ]; then
  PROD_BRANCH="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@.*/@@')"
  PROD_BRANCH="${PROD_BRANCH:-main}"
  echo "⚠️  未从 $WORKFLOW 检测到 --branch，回退默认生产分支：$PROD_BRANCH"
fi
# 显式覆盖（默认=检测值，即 CI 同款 main）
PROD_BRANCH="${BRANCH:-$PROD_BRANCH}"
echo "== 项目：$PROJECT_NAME | 生产分支：$PROD_BRANCH | Account：${ACCOUNT_ID:-自动检测} =="

# ---------- 2/3) 部署（强制 --branch 生产分支 → 生产环境 Secrets 生效） ----------
if [ "${SKIP_DEPLOY:-0}" = "1" ]; then
  echo "ℹ️  SKIP_DEPLOY=1：跳过部署，仅运行验证矩阵。"
else
  # 凭据检查（非交互部署必需；仅验证模式不要求）
  # 优先 CLOUDFLARE_API_TOKEN / CLOUDFLARE_API_KEY；两者皆缺时回退本机 wrangler OAuth 登录
  # （OAuth 凭据存于 ~/Library/Preferences/.wrangler/config/default.toml，本机开发常用）
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${CLOUDFLARE_API_KEY:-}" ]; then
    if CI=1 npx wrangler whoami >/dev/null 2>&1; then
      echo "ℹ️  未设置 CLOUDFLARE_API_TOKEN，回退使用本机 wrangler OAuth 登录。"
    else
      echo "❌ 缺少 CLOUDFLARE_API_TOKEN（或 CLOUDFLARE_API_KEY），且本机未登录 wrangler，无法部署。"
      exit 1
    fi
  fi
  local_branch="$(git branch --show-current 2>/dev/null || true)"
  if [ -n "$local_branch" ] && [ "$local_branch" != "$PROD_BRANCH" ]; then
    echo "ℹ️  当前 git 分支是 '$local_branch'，将以本地工作区内容部署到生产分支 '$PROD_BRANCH'。"
  fi
  echo ""
  echo "== 部署到 Cloudflare Pages（--branch $PROD_BRANCH，生产 Secrets 生效）=="
  if [ -n "$ACCOUNT_ID" ]; then export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"; fi
  if ! CI=1 npx wrangler pages deploy . --project-name "$PROJECT_NAME" --branch "$PROD_BRANCH"; then
    echo "❌ 部署失败（wrangler 退出非零），请检查上方输出。"
    exit 1
  fi
  echo ""
fi

# ---------- 4) 部署后验证矩阵 ----------
DEPLOY_URL="${DEPLOY_URL:-https://${PROJECT_NAME}.pages.dev}"
DEPLOY_URL="${DEPLOY_URL%/}"
echo "== 验证目标：$DEPLOY_URL =="
echo ""
echo "== 部署后验证矩阵 =="

# ① 首页可达且 200（等待 CDN 传播，最多 30 次 × 3s）
HOME_OK=0
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$DEPLOY_URL/" 2>/dev/null || true)"
  if [ "$code" = "200" ]; then HOME_OK=1; break; fi
  sleep 3
done
if [ "$HOME_OK" = "1" ]; then pass "首页 HTTP 200（$DEPLOY_URL/）"; else fail "首页未返回 200"; fi

# ②③ 依赖首页内容：首页不可达时不作内容断言（避免空响应被 grep 误判为 PASS）
HOME_HTML=""
if [ "$HOME_OK" = "1" ]; then
  HOME_HTML="$(curl -s --max-time 15 "$DEPLOY_URL/" 2>/dev/null || true)"
fi

# ② 首页无 unpkg（匹配 CDN 引用 unpkg.com，不误伤本地 index.html 中「不再依赖 unpkg」的注释）
if [ "$HOME_OK" != "1" ]; then
  fail "首页不可达，跳过内容校验（unpkg / 版本戳）"
elif ! echo "$HOME_HTML" | grep -qi 'unpkg\.com'; then
  pass "首页无 unpkg.com 引用（Vue 本地托管生效）"
else
  fail "首页仍引用 unpkg.com（Vue 本地化未生效）"
fi

# ③ 版本戳：本地 index.html 的 ?v= 戳与线上一致（抓旧缓存 / 错目录 / 未部署到最新）
LOCAL_STAMP="$(grep -oE 'v=[A-Za-z0-9]+' index.html | head -1)"
if [ "$HOME_OK" = "1" ]; then
  REMOTE_STAMP="$(echo "$HOME_HTML" | grep -oE 'v=[A-Za-z0-9]+' | head -1)"
  if [ -n "$LOCAL_STAMP" ] && [ "$LOCAL_STAMP" = "$REMOTE_STAMP" ]; then
    pass "版本戳一致（$LOCAL_STAMP）"
  else
    fail "版本戳不一致：本地 ${LOCAL_STAMP:-无} vs 线上 ${REMOTE_STAMP:-无}"
  fi
fi

# ④ /ai/status 重试至 200 且 configured:true（Secrets 生效的权威证据，非 Preview 空环境）
AI_TMP="$TMP_DIR/ai.json"
AI_OK=0
for _ in $(seq 1 20); do
  code="$(curl -s -o "$AI_TMP" -w '%{http_code}' --max-time 15 "$DEPLOY_URL/ai/status" 2>/dev/null || true)"
  if [ "$code" = "200" ] && grep -q '"configured":[[:space:]]*true' "$AI_TMP"; then AI_OK=1; break; fi
  sleep 5
done
if [ "$AI_OK" = "1" ]; then
  pass "/ai/status HTTP 200 + configured:true（Secrets 生效）"
else
  fail "/ai/status 未达 configured:true（疑似 Preview 空环境或 Secrets 缺失）"
fi

# ⑤ /tts 200 + audio/mpeg（Edge 免费回退真实合成；首次冷启动慢，最多 5 次 × 45s）
TTS_TMP="$TMP_DIR/tts.bin"
TTS_OK=0
for _ in $(seq 1 5); do
  meta="$(curl -s -o "$TTS_TMP" -w '%{http_code}|%{content_type}' --max-time 45 \
    -G --data-urlencode 'text=안녕하세요' "$DEPLOY_URL/tts" 2>/dev/null || true)"
  code="${meta%%|*}"
  ctype="${meta#*|}"
  if [ "$code" = "200" ] && echo "$ctype" | grep -qi 'audio/mpeg'; then TTS_OK=1; break; fi
  sleep 5
done
if [ "$TTS_OK" = "1" ]; then
  pass "/tts HTTP 200 + audio/mpeg（TTS 四级回退链路可用）"
else
  fail "/tts 未返回 200 audio/mpeg（EDGE_TTS_ENABLED 未生效或 Edge 端点故障）"
fi

echo "============================================"
echo "  部署后验证矩阵：$PASS PASS / $FAIL FAIL"
echo "============================================"
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 生产部署验证通过：$DEPLOY_URL"
  exit 0
else
  echo "🚨 验证失败，请检查上方 FAIL 项（常见：部署到 Preview 空环境 / CDN 缓存未刷新 / Secrets 缺失）"
  exit 1
fi
