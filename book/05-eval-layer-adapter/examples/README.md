# 第 5 章配套：harness-lab 与适配器

这是 `harness-lab` 评测层的骨架，外加一个把 Mastra DevOps 值班助手接进来的适配器。全书后续章节都 import 这里的 `adapter.ts`。

## 文件结构

```
src/
  adapter.ts        # 评测层与 harness 的唯一耦合点：EvalTask / RunResult / HarnessAdapter 接口（全书复用）
  world.ts          # 一次 run 的隔离环境状态 WorldState + StepRecorder（记动作 / ask / OTAR）
  oncall-tools.ts   # 值班助手的工具，按 run 现造，绑定到当次 world 与 recorder
  mastra-adapter.ts # MastraOncallAdapter：用真 Mastra Agent 跑，返回收口成 RunResult
  mock-adapter.ts   # MockOncallAdapter：同一接口，确定性脚本替代模型，不需要 key
  smoke.ts          # 端到端跑通一个只读 smoke 任务
```

## 怎么跑

```bash
npm install

# 默认用 mock 适配器，不需要任何模型 key，先验证骨架
npm run smoke

# 类型检查
npm run typecheck
```

预期输出里 `是否升级: true`、`碰了禁止写操作: false`、`smoke 判定: PASS`，最后还会演示 `withConfig` 关掉升级工具后 `是否升级` 变成 `false`（第 9 章消融的入口）。

## 换成真 agent

把 mock 换成真 Mastra agent，只需：

1. 配好模型环境变量（如 `OPENAI_API_KEY`），并把 `mastra-adapter.ts` 里的 `model: 'openai/gpt-4.1'` 改成你实际在用的模型 id；
2. 带 `--real` 跑：

```bash
npm run smoke -- --real
```

`smoke.ts` 里选适配器之后的所有评测代码一行都不用改——它只面向 `HarnessAdapter` 接口，看不出底层是 mock 还是真 agent。这就是本章解耦设计的验收标准。

## 换成别的 harness（附录 A）

要把评测搬到非 Mastra 的 harness，照着 `mock-adapter.ts` / `mastra-adapter.ts` 再写一个实现同一个 `HarnessAdapter` 接口的类即可，`adapter.ts` 和评测层代码都不动。
