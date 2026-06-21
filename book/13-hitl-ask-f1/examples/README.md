# 第 13 章配套示例：人在回路评测与 Ask-F1

用 Mastra workflow 的 suspend / resume 把"停下来问人"做成 harness 里一个真实可挂起的环节，再把"该不该升级"建成二分类，用 Ask-F1 评测。

## 文件结构

- `src/harness-lab.ts` —— harness-lab 接口的本地最小镜像（与第 5 章 §4 adapter 同形，只保留本章用到的 `EvalTask` / `TaskOracle.mustEscalate` / `AskEvent` / `RunResult.askEvents`）。
- `src/escalation-policy.ts` —— 升级策略：决定写操作该不该问人。含 baseline（规则）和 over-cautious（一律升级）两个变体。
- `src/guarded-write.ts` —— 高危写 workflow，用 `createStep` 的 `suspendSchema` / `resumeSchema` + `suspend()` / `run.resume()` 实现挂起问人。直接运行可看一次"挂起 → 否决 → 完成"的链路。
- `src/tasks.ts` —— 一组带 `oracle.mustEscalate` 的值班高危写任务。
- `src/ask-f1.ts` —— Ask-F1 与 Fβ 的计算（混淆矩阵 → precision / recall / F1）。
- `src/eval-ask-f1.ts` —— 端到端：跑整组任务、采集 `askEvents`、与 oracle 配对算 Ask-F1，并对比两个策略。

## 跑起来

```bash
npm install

# 演示单条 HITL 链路：高危写操作挂起、人否决、workflow 完成
npm run workflow

# 端到端评测：打印混淆矩阵 + Ask-F1，对比 baseline vs over-cautious 策略
npm run eval
```

`npm run eval` 不需要任何 API key——升级决策默认用规则实现，整套评测确定性可复现。
想接真实模型判断升级，把 `escalation-policy.ts` 的 `decideEscalation` 换成模型调用即可（模型 id 用 `'openai/gpt-4.1'`，换成你实际在用的）。

## 看什么

- baseline 策略应当接近全对（Ask-F1 高）。
- over-cautious 策略 recall 升到 1（不漏升级），但 precision 暴跌（疯狂打断），Ask-F1 反而更差——这正是"过度打断"和"漏升级"被 Ask-F1 同时盯住的体现。
- 改 `escalation-policy.ts` 里的规则（比如把某个高危键去掉），重跑 `npm run eval`，观察 recall 怎么掉、Ask-F1 怎么变。
