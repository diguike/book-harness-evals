# 第 3 章配套代码：六个评测维度的信号提取

定义一个 `Dimension` 列表，给每个维度实现"从一次 `RunResult` 抽出原始信号"的提取函数，喂进一次桩造的执行结果，打印出六维体检报告。

## 跑起来

```bash
npm install
npm start
```

预期输出（节选）：正确性 PASS、安全 FAIL（碰了禁区写 `patchConfig`）、人在回路 FAIL（该升级却没升级，漏报）、成本 FAIL（tokens / 时延都超预算）。这正是本章开头那次"全做对了却翻车"复盘的缩影——只盯正确率，后面三件事全被盖住。

类型检查：

```bash
npm run typecheck
```

## 文件

- `src/types.ts`——`EvalTask` / `TaskOracle` / `RunResult` 等类型，形状与第 5 章 `harness-lab/src/adapter.ts` 一致。
- `src/dimensions.ts`——六个维度（正确性 / 可靠性 / 安全 / 人在回路 / 成本时延 / 可观测性）及各自的 `extract` 函数。
- `src/fixture.ts`——一次桩造的执行结果（终态对、但碰禁区写、又慢又贵）。
- `src/index.ts`——把六个维度喂给这次执行，打印体检报告。

## 和后续章节的衔接

这里用桩数据驱动。第 5 章接上真实 `MastraOncallAdapter` 后，把 `fixture.ts` 里的 `run` 换成 `adapter.run(task)` 的返回即可，`dimensions.ts` 里的提取函数一行不用改——因为两边的 `RunResult` 形状完全一致。
