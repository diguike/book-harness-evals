# 第 9 章配套示例：消融实验与贡献不可加

一个模块之间**真有交互**的 mini 值班 harness，用来当面演示：各模块的消融贡献 Δi **不可加**，ΣΔi ≠ 整体提升。

不依赖外部模型 key —— 用一段确定性脚本代替模型决策，消融结果完全可复现。

> 本章示例不调用任何 Mastra API：`src/adapter.ts` 是第 5 章 `HarnessAdapter` 的 canonical 接口定义，`@mastra/core` 仅作为全书载体的版本声明放在 `peerDependencies`（可选），不安装也能跑。

## 文件

| 文件 | 作用 |
|---|---|
| `src/adapter.ts` | 第 5 章 `HarnessAdapter` 接口的 canonical 定义 |
| `src/world.ts` | 一次 run 的隔离环境状态 + 留痕（对齐第 5 章 world.ts） |
| `src/interacting-adapter.ts` | 三个会互相咬合的模块：`queryMetrics` / `searchRunbook` / `crossCheck`（`crossCheck` 是本章额外引入的演示用编排步骤，把 metrics 与 runbook 交叉比对再决策，不属于贯穿全书的标准工具） |
| `src/tasks.ts` | 评测任务集；含一批“只看 metrics 会判错、靠 runbook+crossCheck 才做对”的边界任务 |
| `src/score.ts` | 状态基评分（第 7 章）：终态 `escalated` 是否等于 `oracle.mustEscalate` |
| `src/wilson.ts` | Wilson 置信区间（第 4 章），给 Δi 配误差棒 |
| `src/run-ablation.ts` | 主脚本：单模块消融 → 可加性检验 → 二阶差分抠交互项 |
| `src/non-additive.ts` | 最小效用模型：带冗余惩罚的解析式 Φ(S)，改一个系数看 ΣΔ 缺口怎么变 |

## 跑

```bash
npm install
npm run ablation       # 跑消融全流程（真任务集 + 状态基评分）
npm run non-additive   # 跑带冗余惩罚的最小效用模型
npm run typecheck      # 仅类型检查
```

## 你会看到什么

1. **单模块消融**：逐个关掉 `queryMetrics` / `searchRunbook` / `crossCheck`，打印各自的 Δi 和 Wilson 误差棒。单独关 `searchRunbook` 或 `crossCheck` 时各 Δ=0.667，损失不小，但这两次消融指向的是同一批边界任务。
2. **可加性检验**：三个 Δi 相加（ΣΔi）明显大于“全开 vs 全关”的整体提升。差出来的缺口，就是被单模块消融重复计的交互效应。
3. **二阶差分**：固定 `queryMetrics` 开，对 `{searchRunbook, crossCheck}` 跑四种开关组合，用
   `Φ(都开) − Φ(只开A) − Φ(只开B) + Φ(都关)`
   把这对模块的交互值单独抠出来，是个正数（互补）。

## 为什么会不可加

`searchRunbook` 给的“该不该升级”先验，**只有经过 `crossCheck` 才会真正影响决策**。少了任何一个，决策都退化成“只看错误率”的启发式，那批边界任务（高错误率却能自愈 / 低错误率却必须升级）就会判错。于是单独消融 runbook 和单独消融 crossCheck 各 Δ=0.667、损失不小，但两次消融指向的是同一批边界任务——被算了两遍，ΣΔi 因此虚高。这正是正文那条结论的可运行证据：消融差值不可加，要公平分账得用第 10 章的 Shapley。
