# 第 11 章配套示例：反事实根因定位

在 OTAR 因果图上对单次失败做反事实单点干预（删除 / 替换 / 改参），重跑看终态是否翻转，定位病灶步。对应正文「查对服务、改错字段」那次 `order-db` 误扩容故障。

## 跑起来

```bash
npm i
npm start            # 桩版：无需 API key，看清算法骨架和翻转逻辑
npm run start:mastra # 真版：接 Mastra + 真模型，需 OPENAI_API_KEY，看真实抖动
npm run typecheck    # 类型检查
```

桩版预期输出（节选）：

```text
候选病灶（失败动作 A1 的因果链）：O1 → T1 → O2 → O3 → T2
逐个单点干预重跑（每个重复 5 次）：
  O1 查日志  substitute 翻转率 0/5  → 旁证
  T1 推理    substitute 翻转率 0/5  → 旁证
  O2 查监控  substitute 翻转率 0/5  → 旁证
  O3 搜手册  substitute 翻转率 5/5  → 翻转点
  T2 推理    substitute 翻转率 3/5  → 翻转点（有抖动，约 3-4/5）
翻转点 2 个；取因果链最上游者：O3
根因 = O3：《连接池打满的应急处理》在内存敏感实例上给出错误建议
```

## 文件

- `src/otar.ts` —— OTAR 节点结构 + `causalChain`（第 8 章定义，就近放一份让本例可独立跑）。
- `src/fixture.ts` —— 一条整理好的失败 trace（生产里由第 8 章 `buildOtar` 产出）。
- `src/intervention.ts` —— 三种干预定义与 `planIntervention`（按节点类型选干预方式）。
- `src/locate.ts` —— `locateRootCause`：剪枝 → 逐节点干预重跑取翻转率 → 取最上游翻转点为根因。
- `src/rerun-stub.ts` —— 确定性桩重跑器（含抖动，体现"须重复 k 次取翻转率"）。
- `src/rerun-mastra.ts` —— 真模型版重跑器，把干预注入工具返回，跑真 Mastra agent。
- `src/run.ts` —— 桩版入口，打印定位结果。

## 边界提醒（详见正文「CHIEF 与这套方法的诚实边界」）

- "最早决定性错误 = 根因"来自 CHIEF（2026 preprint，前沿探索，未独立大规模复现）。
- 翻转要重复 k 次取翻转率，单次结果不可信。
- 因果链是启发式推断，链错则定位错。
- 单点干预对多步耦合失败会判"无根因"，此时回到第 9–10 章模块级归因。
