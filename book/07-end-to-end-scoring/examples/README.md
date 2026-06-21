# 第 7 章配套示例：harness 整体效果评测

把第 5 章的 `harness-lab` 适配器接上，跑通一条完整的整体评测流水线：

```
并发回放任务集 → 状态基评分 → 多维聚合 → 带 Wilson CI 报分
```

## 怎么跑

```bash
npm install
npm run score          # 用 mock 适配器，不需要模型 key，结果确定可复现
npm run score -- --real  # 换真 Mastra agent，需要配好 OPENAI_API_KEY
npm run typecheck
```

`npm run score`（mock 模式）会打印主版本 harness 的整体报告，再跑一版"次优变体"（阈值调高、会漏边界升级）做对比，演示整体分能把两版 harness 区分开。

## 文件导读

评测层骨架（来自第 5 章，这里自带一份以便独立运行）：

- `src/adapter.ts` — `HarnessAdapter` 接口，评测层与具体 harness 的唯一耦合点
- `src/world.ts` — 每次 run 的隔离环境状态 + StepRecorder
- `src/oncall-tools.ts` — 值班助手的工具（查日志/查监控/改配置/升级）
- `src/mastra-adapter.ts` — Mastra 值班助手适配器
- `src/mock-adapter.ts` — 不依赖模型 key 的确定性适配器

第 7 章新增：

- `src/task-suite.ts` — 带 oracle 的值班任务集
- `src/runner.ts` — 固定并发度的任务集 runner
- `src/state-scorer.ts` — 状态基评分（比对 finalState 与 oracle.expectedFinalState）
- `src/stats.ts` — Wilson 置信区间
- `src/aggregate.ts` — 多维聚合（正确率/安全率/成本，每个带 CI）+ 按 tier（smoke/core/hard）分层正确率
- `src/mastra-scorer.ts` — 把 Mastra 内建 llm scorer 当作附加打分组件接进来
- `src/score.ts` — 主流程入口

`mastra-scorer.ts` 展示如何接 Mastra 的 `createScorer`，主流程默认不依赖它（CI 里没 judge key 时可跳过相关性维度），单独 `import` 即可使用。
