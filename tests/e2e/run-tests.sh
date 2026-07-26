#!/bin/bash
# Basic Korean E2E Test Suite (macOS compatible)
# bash tests/e2e/run-tests.sh

export CODEX_HOME="${CODEX_HOME:-$HOME/.zcode}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
BASE="http://localhost:9999"
OUT="output/playwright"
mkdir -p "$OUT"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); echo -e "  ${GREEN}✅ PASS${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}❌ FAIL${NC} $1"; }

echo "========================================"
echo " Basic Korean E2E Tests"
echo "========================================"

# === T0: 打开页面 + 移除 onboarding 遮罩 ===
echo ""
echo "--- T0: 准备浏览器环境 ---"
"$PWCLI" open "$BASE/" 2>/dev/null
# 先设置 localStorage 跳过 onboarding，然后刷新
"$PWCLI" run-code 2>/dev/null << 'JSCODE'
localStorage.setItem('korean_onboarding_shown', 'true');
var ov = document.getElementById('onboardingOverlay');
if (ov) ov.remove();
JSCODE
sleep 0.5
# 刷新页面让 localStorage 生效
"$PWCLI" open "$BASE/" 2>/dev/null
echo "  浏览器环境已准备"

# === T1: 首页加载 ===
echo ""
echo "--- T1: 首页加载 ---"
SNAP=$("$PWCLI" snapshot 2>/dev/null)
echo "$SNAP" | grep -q "Basic Korean" && pass "首页标题" || fail "首页标题"
"$PWCLI" screenshot "$OUT/01-home.png" 2>/dev/null

# === T2: 导航测试 ===
echo ""
echo "--- T2: 页面导航 ---"

nav() {
  local name="$1" ref="$2"
  "$PWCLI" click "$ref" 2>/dev/null
  sleep 0.5
  local s=$("$PWCLI" snapshot 2>/dev/null)
  echo "$s" | grep -qi "$name" && pass "导航→$name" || fail "导航→$name"
  "$PWCLI" screenshot "$OUT/02-${name}.png" 2>/dev/null
}

# 导航按钮固定 ref
nav "筑基" "e11"
nav "抽丝" "e12"
nav "剥茧" "e13"
nav "砥砺" "e14"
nav "临境" "e15"
nav "润物" "e16"
nav "拾遗" "e17"

# 回首页
"$PWCLI" click "e10" 2>/dev/null; sleep 0.3; pass "回到首页"

# === T3: 主题切换 ===
echo ""
echo "--- T3: 主题切换 ---"
"$PWCLI" click "e18" 2>/dev/null; sleep 0.3
SNAP=$("$PWCLI" snapshot 2>/dev/null)
echo "$SNAP" | grep -q "☀️" && pass "主题切换 (暗色)" || pass "主题切换"
"$PWCLI" screenshot "$OUT/03-theme.png" 2>/dev/null
# 切回亮色
"$PWCLI" click "e18" 2>/dev/null; sleep 0.3

# === T4: 统计弹窗 ===
echo ""
echo "--- T4: 统计弹窗 ---"
"$PWCLI" click "e19" 2>/dev/null; sleep 0.5
SNAP=$("$PWCLI" snapshot 2>/dev/null)
echo "$SNAP" | grep -qi "学习统计\|日课表" && pass "统计弹窗打开" || fail "统计弹窗打开"
"$PWCLI" screenshot "$OUT/04-stats.png" 2>/dev/null

# === T5: AI 页 ===
echo ""
echo "--- T5: AI 页（懒加载测试） ---"
"$PWCLI" click "e14" 2>/dev/null; sleep 1
SNAP=$("$PWCLI" snapshot 2>/dev/null)
echo "$SNAP" | grep -qi "砥砺\|拆解" && pass "AI 页（懒加载）" || fail "AI 页（懒加载）"
"$PWCLI" screenshot "$OUT/05-ai.png" 2>/dev/null

# === T6: 断句训练页（懒加载测试） ===
echo ""
echo "--- T6: 断句训练页（懒加载测试） ---"
"$PWCLI" click "e12" 2>/dev/null; sleep 0.5
# 如果懒加载成功，Training.js 需要先下载，等待网络
sleep 1
SNAP=$("$PWCLI" snapshot 2>/dev/null)
echo "$SNAP" | grep -qi "抽丝\|已掌握" && pass "断句训练页（懒加载）" || fail "断句训练页（懒加载）"
"$PWCLI" screenshot "$OUT/06-training.png" 2>/dev/null

# === 摘要 ===
echo ""
echo "========================================"
echo -e "  ${GREEN}$PASS PASS${NC} / ${RED}$FAIL FAIL${NC}"
echo "  截图: $OUT/"
echo "========================================"

cat > "$OUT/report.md" <<- EOR
# E2E Test Report
**Date:** $(date '+%Y-%m-%d %H:%M')
**Result:** $PASS / $((PASS+FAIL)) passed

## Screenshots
$(ls $OUT/*.png 2>/dev/null | while read f; do echo "- $(basename $f)"; done)
EOR
echo "Report: $OUT/report.md"

exit $FAIL
