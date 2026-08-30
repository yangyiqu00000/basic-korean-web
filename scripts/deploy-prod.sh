#!/bin/bash
# scripts/deploy-prod.sh — 一键部署到 Cloudflare Pages 生产分支 + 内置部署后验证矩阵
#
# 背景：Cloudflare Pages 的 Secrets（AI_API_KEY / EDGE_TTS_ENABLED 等）只挂在生产环境。
# 不带 --branch 部署时 wrangler 默认用当前 git 分支 → 落到 Preview 环境：
# /ai/status 返回 configured:false、/tts 走不到 Edge 免费回退直接 503，且 Preview 与正式域名分离，极难察觉。
# 本脚本强制 --branch <生产分支>（默认 main）部署到生产环境，并以内置验证矩阵兜底。
#
# 验证矩阵：
#   1. /tts 200 + audio/mpeg     — Edge 免费回退真实合成（非 503 浏览器降级）
#   2. 首页 HTML 无 unpkg.com    — Vue 本地化未回退 CDN
#   3. 首页版本戳 = 本地 index.html 版本戳 — 未命中旧 CDN 缓存 / 未部署错目录
#   4. /ai/status 重试至 200 且 configured:true — Secrets 已生效，非 Preview 空环境
#
# 用法：
#   bash scripts/deploy-prod.sh                          # 检测 → 部署 → 验证
#   DEPLOY_URL=https://your.domain bash scripts/deploy-prod.sh   # 验证自定义域名
#   SKIP_DEPLOY=1 bash scripts/deploy-prod.sh            # 只跑验证矩阵（线上复查，不部署）
#   BRANCH=my-branch bash scripts/deploy-prod.sh         # 覆盖部署分支（默认检测=main，不推荐）
#
# 依赖：本地 wrangler（devDependencies）+ CLOUDFLARE_API_TOKEN（或 CLOUDFLARE_API_KEY）；
#   两者皆缺时自动回退本机 wrangler OAuth 登录。

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WORKFLOW=".github/workflows/deploy.yml"
PASS=0
FAIL=0
pass() { PASS=$((PASS+1)); echo -e "  [PASS] $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  [FAIL] $1"; }
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

command -v curl >/dev/null 2>&1 || { echo "[ERROR] curl not found"; exit 1; }
command -v npx  >/dev/null 2>&1 || { echo "[ERROR] npx not found"; exit 1; }

# ---------- 1) Detect production branch / project name / account ID from CI workflow ----------
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
  echo "[ERROR] Cannot determine Pages project name from $WORKFLOW or wrangler.toml"
  exit 1
fi
if [ -z "$PROD_BRANCH" ]; then
  PROD_BRANCH="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@.*/@@')"
  PROD_BRANCH="${PROD_BRANCH:-main}"
  echo "[WARN] No --branch found in $WORKFLOW; fallback production branch: $PROD_BRANCH"
fi
PROD_BRANCH="${BRANCH:-$PROD_BRANCH}"
echo "== Project: $PROJECT_NAME | Branch: $PROD_BRANCH | Account: ${ACCOUNT_ID:-auto} =="

# ---------- 2/3) Deploy (force --branch so production Secrets are active) ----------
if [ "${SKIP_DEPLOY:-0}" = "1" ]; then
  echo "[INFO] SKIP_DEPLOY=1: skipping deploy, running verification matrix only."
else
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${CLOUDFLARE_API_KEY:-}" ]; then
    if CI=1 npx wrangler whoami >/dev/null 2>&1; then
      echo "[INFO] No CLOUDFLARE_API_TOKEN; using local wrangler OAuth login."
    else
      echo "[ERROR] Missing CLOUDFLARE_API_TOKEN / CLOUDFLARE_API_KEY and not logged into wrangler."
      exit 1
    fi
  fi
  local_branch="$(git branch --show-current 2>/dev/null || true)"
  if [ -n "$local_branch" ] && [ "$local_branch" != "$PROD_BRANCH" ]; then
    echo "[INFO] Current git branch is '$local_branch'; deploying local working tree to '$PROD_BRANCH'."
  fi
  echo ""
  echo "== Deploying to Cloudflare Pages (branch: $PROD_BRANCH, production secrets) =="
  if [ -n "$ACCOUNT_ID" ]; then export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"; fi
  if ! CI=1 npx wrangler pages deploy . --project-name "$PROJECT_NAME" --branch "$PROD_BRANCH"; then
    echo "[ERROR] wrangler deploy failed."
    exit 1
  fi
  echo ""
fi

# ---------- 4) Post-deploy verification matrix ----------
DEPLOY_URL="${DEPLOY_URL:-https://${PROJECT_NAME}.pages.dev}"
DEPLOY_URL="${DEPLOY_URL%/}"
echo "== Verification target: $DEPLOY_URL =="
echo ""
echo "== Verification matrix =="

# 1) Home page 200 (wait for CDN propagation, up to 30 x 3s)
HOME_OK=0
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$DEPLOY_URL/" 2>/dev/null || true)"
  if [ "$code" = "200" ]; then HOME_OK=1; break; fi
  sleep 3
done
if [ "$HOME_OK" = "1" ]; then pass "Home page HTTP 200 ($DEPLOY_URL/)"; else fail "Home page did not return 200"; fi

HOME_HTML=""
if [ "$HOME_OK" = "1" ]; then
  HOME_HTML="$(curl -s --max-time 15 "$DEPLOY_URL/" 2>/dev/null || true)"
fi

# 2) No unpkg.com references
if [ "$HOME_OK" != "1" ]; then
  fail "Home page unreachable; skipping content checks"
elif ! echo "$HOME_HTML" | grep -qi 'unpkg\.com'; then
  pass "Home page has no unpkg.com references"
else
  fail "Home page still references unpkg.com"
fi

# 3) Version stamp matches local index.html
LOCAL_STAMP="$(grep -oE 'v=[A-Za-z0-9]+' index.html | head -1)"
if [ "$HOME_OK" = "1" ]; then
  REMOTE_STAMP="$(echo "$HOME_HTML" | grep -oE 'v=[A-Za-z0-9]+' | head -1)"
  if [ -n "$LOCAL_STAMP" ] && [ "$LOCAL_STAMP" = "$REMOTE_STAMP" ]; then
    pass "Version stamp matches ($LOCAL_STAMP)"
  else
    fail "Version stamp mismatch: local ${LOCAL_STAMP:-none} vs remote ${REMOTE_STAMP:-none}"
  fi
fi

# 4) /ai/status 200 + configured:true
AI_TMP="$TMP_DIR/ai.json"
AI_OK=0
for _ in $(seq 1 20); do
  code="$(curl -s -o "$AI_TMP" -w '%{http_code}' --max-time 15 "$DEPLOY_URL/ai/status" 2>/dev/null || true)"
  if [ "$code" = "200" ] && grep -q '"configured":[[:space:]]*true' "$AI_TMP"; then AI_OK=1; break; fi
  sleep 5
done
if [ "$AI_OK" = "1" ]; then
  pass "/ai/status HTTP 200 + configured:true"
else
  fail "/ai/status did not return configured:true (Preview env or missing Secrets)"
fi

# 5) /tts 200 + audio/mpeg
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
  pass "/tts HTTP 200 + audio/mpeg"
else
  fail "/tts did not return audio/mpeg"
fi

echo "============================================"
echo "  Verification matrix: $PASS PASS / $FAIL FAIL"
echo "============================================"
if [ "$FAIL" -eq 0 ]; then
  echo "[OK] Production deployment verified: $DEPLOY_URL"
  exit 0
else
  echo "[ERROR] Verification failed. Check FAIL items above."
  exit 1
fi
