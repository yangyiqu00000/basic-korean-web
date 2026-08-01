#!/bin/bash
# scripts/rebuild-data.sh — 重新生成合并数据文件（P1-7 性能优化）
# 用法：bash scripts/rebuild-data.sh
# 说明：js/data_core.js = data.js + rules_data.js + stems_data.js（保持加载顺序）
#       js/data_ext.js  = sentences_data.js + reference_data.js + word_mnemonics_data.js
# 数据源文件仍是「唯一真相」，改数据后重跑本脚本即可（勿手改合并产物）。
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "生成 js/data_core.js ..."
{ echo '// js/data_core.js — 合并产物（data.js + rules_data.js + stems_data.js，勿手改，重跑 scripts/rebuild-data.sh）'; \
  cat js/data.js js/rules_data.js js/stems_data.js; } > js/data_core.js

echo "生成 js/data_ext.js ..."
{ echo '// js/data_ext.js — 合并产物（sentences_data.js + reference_data.js + word_mnemonics_data.js，保持依赖顺序，勿手改）'; \
  cat js/sentences_data.js js/reference_data.js js/word_mnemonics_data.js; } > js/data_ext.js

node --check js/data_core.js && node --check js/data_ext.js
echo "✅ 合并完成（node --check 通过）"
