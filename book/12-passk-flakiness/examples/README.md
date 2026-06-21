# 第 12 章配套代码：pass^k 与 flakiness 检测

把第 7 章"跑一次"的整体分升级成"重复 n 次"的可靠性评测：估 pass@k / pass^k、量化 flakiness 抖动、给 pass^k 配 bootstrap 置信区间，并演示怎么把抖动归因到具体来源。

## 跑起来

```bash
npm i
npm run stability     # 主入口：分层重复 + pass^k + flakiness + 双重门禁 + 抖动归因对照
npm run typecheck     # 类型检查
```

不需要任何模型 key。`flaky-adapter.ts` 用一段确定性脚本 + 可控伪随机源还原"召回顺序不稳导致偶发失败"的故障，全程可复现。

## 文件

| 文件 | 作用 |
|---|---|
| `src/adapter.ts` | 第 5 章 `HarnessAdapter` / `EvalTask` / `RunResult` 接口（本章扩展了 `risk` 标签） |
| `src/passk.ts` | `passAtK` / `passHatK` 解析式、`estimatePassHatK` 无偏组合估计、`flakiness`、`bootstrapPassHatKCI` |
| `src/repeat-run.ts` | 把任意 adapter 的同一任务重复跑 n 次，收集 0/1 成功序列 |
| `src/flaky-adapter.ts` | 可注入抖动源的 mock adapter，模拟召回顺序不稳；`withConfig` 切换抖动源做对照 |
| `src/stability.ts` | 主入口：分层重复、估 pass^k + flakiness + CI、双重门禁、抖动归因对照 |

## 你会看到什么

- `pass@5` 高而 `pass^5` 低，方向相反——能力上界乐观、可靠性下界悲观。
- 任务集是一条抖动的高危写任务（`pay-escalate`，p̂ ≈ 0.83、flakiness ≈ 0.56）+ 两条稳定只读任务。两条稳定任务把整体可靠性分摊高到 0.773，单看聚合分（阈值 0.7）会放它过——但单任务 flakiness 门禁（阈值 0.2）把 `pay-escalate` 拦下。这正是"聚合分不够、必须再加一道 flakiness 门禁"的演示。
- 抖动归因对照：把 temperature 压到 0 flakiness 不变（不是这个来源），给召回结果加确定排序后 `pay-escalate` 变成 12/12、flakiness 归零、整体分升到 1.000 放行（锁定来源是工具返回非确定）。
- 每条任务的 k 取 `min(K, 重复次数)`：高危写跑 12 次用 pass^5，只读跑 3 次用 pass^3，避免 k 超过实际重复次数导致组合估计无定义。

真实评测把 `FlakyOncallAdapter` 换成基于 `@mastra/core` 的 `MastraOncallAdapter`（`model: 'openai/gpt-4.1'`，换成你实际在用的模型 id），其余评测层代码不变——这正是第 5 章 adapter 解耦的意义。
