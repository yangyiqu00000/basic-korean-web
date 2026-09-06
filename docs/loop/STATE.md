# LOOP STATE（跨上下文续接的唯一权威现场，每轮收尾必须更新）

- 当前状态：**第三期 loop 已收尾**——10 轮（019–028）全部关闭，队列三候选全部处置完毕
- 本期成果（8 commits，三轮 fix 级数据完整性 + 两轮竞态根治 + 一轮 PWA 对齐 + 两轮回归基建）：
  - 75d7b17 019：TTS 四级回退链 + Cache API 缓存回归（C2 揭示「KV 候选」早已实现为 Cache API）；修两个回归脚本的孤儿进程缺陷
  - 020：B2 拾遗搜索判定不做（规模拐点未到，解除条件：收藏 >100 条）
  - ed57bd3 021：移动端虚拟键盘三件套（interactive-widget + dvh 回退链）+ **重大竞态修复**：rerenderWordList 兜底写 #mainContent 抹掉 #vue-root（Vue 状态活着 DOM 永久失效）
  - e1a2879 022：同款兜底竞态全库清零（switchSkeletonTab / setTrainingFilter）
  - c289865 023：clearData(ALL) 补漏复习日志键
  - 4596696 024：PWA 主题色对齐（manifest 淘汰旧色 #c46a29→#af5e25 + theme-color meta 双值）
  - 503c91b 025：exportAllData 同族补漏（备份此前导不出复习历史）
  - c83f0f8 026：根治轮——ALL_STORAGE_KEYS 单一事实源 + 自检一致性断言
  - d9925e1 027：AGENTS 契约登记（4 条新坑点/范式）；028 标杆对照（质量基线三处修订）
- 队列处置终态：STATE 三候选全关闭（C2=已实现+回归固化 ｜ B2=判定不做 ｜ 键盘遮挡=三件套修复+断言）；022-026 为扫描产出的新候选
- 待用户拍板事项（**优先级最高**）：**推送 main 触发生产部署**——本地已领先 30 commits，生产仍停在 8 月构建（引用已删除的 StatsPage.js 报 404），本期 8 个修复全部未到线上
- 版本戳当前值：`?v=20260830s`
- 下一期候选（扫描备忘）：
  - 快捷键面板移动端 UI 入口（? 键无实体键盘不可达；入口位置需设计评审——顶栏禁加按钮）
  - SW 离线兜底页（当前 fetch 缓存命中失败即裸 404）
  - 导入备份的「键白名单」过松（importAllData 按 Object.keys 回放任意键，恶意备份可注入任意 localStorage 键——低风险但值得收紧）
