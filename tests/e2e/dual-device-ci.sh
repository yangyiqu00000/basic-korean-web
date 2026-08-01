#!/bin/bash
# tests/e2e/dual-device-ci.sh — CI 门：双设备云同步回归（wrangler pages dev 本地 D1 + 真实 API）
#
# 流程：端口预清理 → schema 应用（独立 persist 目录）→ 启动 pages dev → 等 /api/status 就绪
#       → register（dev 验证码回显）→ 播种设备 A → conflict → clear
# 任一模式失败即退出非零（拦截部署）。依赖：wrangler（devDependencies）+ Node 18+（fetch）。
#
# 断言策略：以 fixture 的**退出码**为准（dual-device-sync.js 各模式 process.exit(failN ? 1 : 0)），
# 不 grep 输出文本——fixture 输出带 ANSI 颜色码，文本 grep 会误判/漏判。
#
# 用法：bash tests/e2e/dual-device-ci.sh [port]   # 默认 8790（避开 9999 web_server 与 8788 开发实例）

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PORT="${1:-8790}"
BASE="http://localhost:${PORT}"
PERSIST="$(mktemp -d)"
PAGES_PID=""
PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); echo -e "  \033[0;32m✅ PASS\033[0m $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  \033[0;31m❌ FAIL\033[0m $1"; }

# 杀掉测试端口上的所有监听者（含 workerd 子进程，避免 kill 包装进程后端口仍被占用）
kill_port() {
  local pids
  pids="$(lsof -ti "tcp:${PORT}" 2>/dev/null)"
  if [ -n "$pids" ]; then echo "$pids" | xargs kill -9 2>/dev/null; fi
  # 等待端口真正释放（最多 10s），避免 workerd 释放慢导致后续 bind 失败
  for _ in $(seq 1 10); do
    if ! lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
}
cleanup() {
  [ -n "$PAGES_PID" ] && kill "$PAGES_PID" 2>/dev/null
  kill_port
  rm -rf "$PERSIST"
}
trap cleanup EXIT

echo "== 双设备云同步回归（$BASE，独立 D1 状态）=="

# 0) 预清理：确保端口空闲（防止旧实例残留 → 新实例 bind 失败、请求误连旧实例返回 405）
kill_port

# 1) schema 应用到本地 D1（与 pages dev 共用同一 persist 目录）
if npx wrangler d1 execute basic-korean-db --local --persist-to "$PERSIST" --file=./schema.sql >/dev/null 2>&1; then
  pass "schema.sql 应用到本地 D1"
else
  fail "schema 应用失败"
  exit 1
fi

# 2) 启动 pages dev（后台，绑定 127.0.0.1，非交互）
npx wrangler pages dev . --port "$PORT" --ip 127.0.0.1 --persist-to "$PERSIST" --show-interactive-dev-session=false \
  >/tmp/dual-device-pagesdev.log 2>&1 &
PAGES_PID=$!
# 2a) 快速存活探针：启动后 3s 检查进程是否还活着（bind 失败/编译崩溃 wrangler 必然退出）
#     与 readiness 循环内的 kill -0 配合，杜绝误连本机孤儿旧实例（其无 send-code 路由 → 405）
sleep 3
if ! kill -0 "$PAGES_PID" 2>/dev/null; then
  fail "pages dev 进程启动即退出（端口 $PORT 可能被占用）"
  tail -15 /tmp/dual-device-pagesdev.log || true
  exit 1
fi

# 3) 等待 /api/status 就绪（D1 绑定 + PBKDF2 双探针，最长 90s）
READY=0
for _ in $(seq 1 90); do
  # 必须同时满足：① 本进程存活（bind 失败则 wrangler 退出，kill -0 失败）
  #               ② /api/status 返回 ok:true（D1 绑定 + PBKDF2 双探针，schema 已生效）
  # 二者兼得才证明响应方是「我们自己带 schema 的实例」，杜绝误连本机孤儿旧实例（405）
  if kill -0 "$PAGES_PID" 2>/dev/null && curl -sf "$BASE/api/status" 2>/dev/null | grep -q '"ok": true'; then
    READY=1; break
  fi
  sleep 1
done
if [ "$READY" = "1" ]; then
  pass "pages dev 就绪（/api/status ok:true）"
else
  fail "pages dev 未就绪"
  tail -40 /tmp/dual-device-pagesdev.log || true
  exit 1
fi

# 4) register（本地 dev 验证码自动回显，无需 Resend；以退出码为准）
if node tests/e2e/dual-device-sync.js register "$BASE" > /tmp/dual-reg.log 2>&1; then
  pass "register：带码注册成功"
else
  fail "register 失败"
  tail -20 /tmp/dual-reg.log || true
  exit 1
fi
ACCT="$(grep '^ACCOUNT' /tmp/dual-reg.log | awk '{print $2}')"
PASSW="$(grep '^ACCOUNT' /tmp/dual-reg.log | awk '{print $3}')"
if [ -z "$ACCT" ]; then fail "register 未输出 ACCOUNT"; exit 1; fi

# 5) 播种设备 A（conflict 模式依赖设备 A 已有 1-0 / h1 / 가）
if node tests/e2e/seed-device-a.js "$BASE" "$ACCT" "$PASSW" > /tmp/dual-seed.log 2>&1 && grep -q "SEED_OK" /tmp/dual-seed.log; then
  pass "seed：设备 A 播种完成"
else
  fail "seed 失败"
  tail -10 /tmp/dual-seed.log || true
  exit 1
fi

# 6) conflict 模式（设备 B 拉取→并集→后写胜出→墓碑→收藏去重；退出码权威）
if node tests/e2e/dual-device-sync.js conflict "$ACCT" "$PASSW" "$BASE" > /tmp/dual-conflict.log 2>&1; then
  pass "conflict：全场景 PASS"
else
  fail "conflict 存在失败断言"
  grep -E '✅ PASS|❌ FAIL' /tmp/dual-conflict.log | tail -20 || true
fi

# 7) clear 模式（清空墓碑 + 删除传播；退出码权威）
if node tests/e2e/dual-device-sync.js clear "$ACCT" "$PASSW" "$BASE" > /tmp/dual-clear.log 2>&1; then
  pass "clear：全场景 PASS"
else
  fail "clear 存在失败断言"
  grep -E '✅ PASS|❌ FAIL' /tmp/dual-clear.log | tail -20 || true
fi

echo "============================================"
echo "  双设备云同步回归：$PASS PASS / $FAIL FAIL"
echo "============================================"
if [ "$FAIL" -eq 0 ]; then exit 0; else exit 1; fi
