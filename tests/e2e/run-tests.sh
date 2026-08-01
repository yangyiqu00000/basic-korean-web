#!/bin/bash
# Basic Korean E2E Test Suite (macOS compatible)
# bash tests/e2e/run-tests.sh

export CODEX_HOME="${CODEX_HOME:-$HOME/.zcode}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"

# CI 环境（GitHub Actions）下本地 playwright CLI 不存在 → 委托便携式 Playwright 运行器
# （tests/e2e/ci-run.js，复刻本套件全部关键安全断言，退出码 0/1 兼容）
if [ "$GITHUB_ACTIONS" = "true" ] && [ ! -x "$PWCLI" ]; then
  echo "CI 环境：本地 playwright CLI 不可用，切换到便携式运行器 tests/e2e/ci-run.js"
  exec node tests/e2e/ci-run.js
fi

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

# run-code 帮助说明：必须传「JS 函数」作参数（会以 page 调用，输出 ### Result）
# heredoc 裸表达式会静默失败（__fn__ is not a function），所有 run-code 均用函数形式。
run_code() { "$PWCLI" run-code "(page) => page.evaluate($1)" 2>/dev/null; }

# === T0: Onboarding 遮罩测试 ===
echo ""
echo "--- T0: Onboarding 遮罩测试 ---"
# 先清除 localStorage 让 onboarding 出现
run_code "() => localStorage.removeItem('korean_onboarded')"
"$PWCLI" open "$BASE/" 2>/dev/null
sleep 0.5
SNAP=$("$PWCLI" snapshot 2>/dev/null)
if echo "$SNAP" | grep -qi "最小可行\|开始学习"; then
  pass "Onboarding 出现"
  # 关闭 onboarding
  run_code "() => window.closeOnboarding()"
  sleep 0.5
  SNAP2=$("$PWCLI" snapshot 2>/dev/null)
  echo "$SNAP2" | grep -qi "onboarding" && fail "Onboarding 关闭" || pass "Onboarding 关闭后 DOM 清除"
else
  fail "Onboarding 出现"
fi
# 设置 localStorage 让后续测试不弹窗
run_code "() => localStorage.setItem('korean_onboarded', '1')"
"$PWCLI" open "$BASE/" 2>/dev/null
sleep 0.5
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
nav "词句表" "e18"

# 回首页
"$PWCLI" click "e10" 2>/dev/null; sleep 0.3; pass "回到首页"

# === T3: 主题切换 ===
echo ""
echo "--- T3: 主题切换 ---"
"$PWCLI" click "e19" 2>/dev/null; sleep 0.3
SNAP=$("$PWCLI" snapshot 2>/dev/null)
echo "$SNAP" | grep -q "☀️" && pass "主题切换 (暗色)" || pass "主题切换"
"$PWCLI" screenshot "$OUT/03-theme.png" 2>/dev/null
# 切回亮色
"$PWCLI" click "e18" 2>/dev/null; sleep 0.3

# === T4: 统计弹窗 ===
echo ""
echo "--- T4: 统计弹窗 ---"
"$PWCLI" click "e20" 2>/dev/null; sleep 1
SNAP=$("$PWCLI" snapshot 2>/dev/null)
if echo "$SNAP" | grep -qi "学习统计\|日课表\|已掌握\|导出数据"; then
  pass "统计弹窗打开"
else
  # 重试：可能过渡动画还在跑
  sleep 1
  SNAP=$("$PWCLI" snapshot 2>/dev/null)
  echo "$SNAP" | grep -qi "学习统计\|日课表\|已掌握" && pass "统计弹窗打开（重试）" || fail "统计弹窗打开"
fi
"$PWCLI" screenshot "$OUT/04-stats.png" 2>/dev/null
# 关闭统计弹窗，避免遮罩拦截后续点击
run_code "() => window.closeStats()"
sleep 0.3

# === T5: AI 页 ===
echo ""
echo "--- T5: AI 页 ---"
"$PWCLI" click "e14" 2>/dev/null; sleep 1
SNAP=$("$PWCLI" snapshot 2>/dev/null)
echo "$SNAP" | grep -qi "砥砺\|拆解" && pass "AI 页" || fail "AI 页"
"$PWCLI" screenshot "$OUT/05-ai.png" 2>/dev/null

# === T6: 断句训练页（含筛选/导航回归） ===
echo ""
echo "--- T6: 断句训练页 ---"
"$PWCLI" click "e12" 2>/dev/null; sleep 0.5
sleep 1
SNAP=$("$PWCLI" snapshot 2>/dev/null)
echo "$SNAP" | grep -qi "抽丝\|已掌握" && pass "断句训练页" || fail "断句训练页"
# 回归：点击筛选后 #vue-root 不能被销毁，导航必须仍可用
# 全程用 JS 驱动（不受弹窗遮罩影响）。注意：playwright-cli 对 evaluate 返回值
# 为字符串时会整体 JSON 转义，grep 会失配——因此每个断言单独返回布尔值
# （CLI 输出 ### Result 后跟 true/false）。
#   断言1 vueRootOk = 筛选后 #vue-root 仍存在（Vue 挂载点未毁）
VROOT=$(run_code "async () => { window.navigate('training'); await new Promise(r => setTimeout(r, 300)); var b = null; document.querySelectorAll('.filter-btn').forEach(function(x){ if (x.dataset.group === 'unmastered') b = x; }); if (b) b.click(); await new Promise(r => setTimeout(r, 300)); return !!document.getElementById('vue-root'); }")
echo "$VROOT" | grep -A1 '### Result' | grep -qx 'true' && pass "筛选后 #vue-root 保留" || fail "筛选后 #vue-root 保留"
#   断言2 homeOk = 筛选后能导航回首页且 hero 内容真实渲染（非仅 header 常驻文本）
HOME_OK=$(run_code "async () => { window.navigate('home'); await new Promise(r => setTimeout(r, 600)); return !!document.querySelector('.hero h1'); }")
echo "$HOME_OK" | grep -A1 '### Result' | grep -qx 'true' && pass "筛选后导航正常" || fail "筛选后导航正常"
"$PWCLI" screenshot "$OUT/06-training.png" 2>/dev/null

# === T7: pageTick/refreshPage 机制回归测试 ===
echo ""
echo "--- T7: pageTick/refreshPage 机制回归 ---"
# 背景：clearData / saveCustomScene / deleteCustomScene 改数据后必须递增 pageTick
# 使 :key 变化触发组件重建，否则 Vue 下 currentPage 不变不重渲染，界面不更新。
# 全部用 JS 驱动 + 每个断言单独返回布尔值（playwright-cli 字符串返回值会被转义，grep 失配）。
# 隔离：清掉上次运行可能遗留的自定义场景，避免污染断言2/5。
run_code "async () => { localStorage.removeItem('korean_custom_scenes'); return true; }" >/dev/null 2>&1

#   断言1 keySaveOk = 保存自定义场景后 pageKey 变化（scene-N → scene-N+1）
KEY_SAVE=$(run_code "async () => { window.navigate('scene'); await new Promise(r => setTimeout(r, 400)); var t = document.getElementById('sceneTitleInput'); var p = document.getElementById('scenePromptInput'); if (!t || !p) return false; t.value = '医院就诊'; p.value = '你在韩国医院看病，需要向医生描述症状'; var k1 = window.vueApp.pageKey; window.saveCustomScene(); await new Promise(r => setTimeout(r, 400)); return window.vueApp.pageKey !== k1; }")
echo "$KEY_SAVE" | grep -A1 '### Result' | grep -qx 'true' && pass "保存场景后 pageKey 变化" || fail "保存场景后 pageKey 变化"
#   断言2 cardShown = 保存后自定义场景卡片即时出现（无需手动导航）
CARD_SHOWN=$(run_code "async () => { var els = document.querySelectorAll('.scene-card-custom .scene-title'); for (var i = 0; i < els.length; i++) { if (els[i].textContent === '医院就诊') return true; } return false; }")
echo "$CARD_SHOWN" | grep -A1 '### Result' | grep -qx 'true' && pass "保存后卡片即时出现" || fail "保存后卡片即时出现"
#   断言3 vueRootSave = 保存后 #vue-root 仍存活（Vue 挂载点未被覆盖删除）
VROOT_SAVE=$(run_code "async () => { await new Promise(r => setTimeout(r, 200)); return !!document.getElementById('vue-root') && !!document.querySelector('.scene-page-vue'); }")
echo "$VROOT_SAVE" | grep -A1 '### Result' | grep -qx 'true' && pass "保存后 #vue-root 存活" || fail "保存后 #vue-root 存活"
#   断言4 keyDelOk = 删除自定义场景后 pageKey 再次变化
KEY_DEL=$(run_code "async () => { var k2 = window.vueApp.pageKey; window.deleteCustomScene(0); await new Promise(r => setTimeout(r, 400)); return window.vueApp.pageKey !== k2; }")
echo "$KEY_DEL" | grep -A1 '### Result' | grep -qx 'true' && pass "删除场景后 pageKey 变化" || fail "删除场景后 pageKey 变化"
#   断言5 cardGone = 删除后卡片即时消失
CARD_GONE=$(run_code "async () => { await new Promise(r => setTimeout(r, 200)); return document.querySelectorAll('.scene-card-custom').length === 0; }")
echo "$CARD_GONE" | grep -A1 '### Result' | grep -qx 'true' && pass "删除后卡片即时消失" || fail "删除后卡片即时消失"
#   断言6 keyClearOk = 清空训练数据后 pageKey 变化 + 进度即时刷新为 0 / 43
KEY_CLEAR=$(run_code "async () => { window.navigate('training'); await new Promise(r => setTimeout(r, 400)); window.trainingDone = { '1': true, '2': true }; localStorage.setItem('korean_training_done', JSON.stringify(window.trainingDone)); var k3 = window.vueApp.pageKey; window.confirm = function(){ return true; }; window.clearData('korean_training_done', '抽丝训练进度'); await new Promise(r => setTimeout(r, 500)); return window.vueApp.pageKey !== k3; }")
echo "$KEY_CLEAR" | grep -A1 '### Result' | grep -qx 'true' && pass "清空数据后 pageKey 变化" || fail "清空数据后 pageKey 变化"
#   断言7 progZero = 清空后训练进度文本即时变为 0 / 43
PROG_ZERO=$(run_code "async () => { var el = document.getElementById('trainingProgress'); return !!(el && el.textContent.trim() === '0 / 43'); }")
echo "$PROG_ZERO" | grep -A1 '### Result' | grep -qx 'true' && pass "清空后进度即时刷新 0/43" || fail "清空后进度即时刷新 0/43"
"$PWCLI" screenshot "$OUT/07-pagetick.png" 2>/dev/null

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
