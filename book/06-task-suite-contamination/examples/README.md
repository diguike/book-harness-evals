# 第 6 章配套代码：评测任务集的构建与防污染

把一套 harness 级评测任务集从生成、注入 canary、切分到污染判定的整条流程跑通。`src/types.ts` 直接收录第 5 章 `harness-lab/src/adapter.ts` 的 canonical 接口 `EvalTask` / `TaskOracle`，字段与第 5 章 adapter.ts 一致，以便示例独立可跑。

本章代码只做任务集构建与污染判定，不触发任何 agent 真实执行，因此刻意不依赖 Mastra 运行时——`src/types.ts` 收录第 5 章 adapter 的接口，跑起来零外部框架依赖。把 `index.ts` 里的桩接上 `MastraOncallAdapter` 时（第 7 章），再引入 `@mastra/core` 即可。

## 跑起来

```bash
npm install
npm start
```

预期输出：两个场景的污染判定对比。

- **未污染场景**：公开集与保留集同分布，判定"分数可信"，canary 无漏出。注意 heldOut 样本量较小时（本例哈希切分后保留集只有 23 题），两集通过率可能因随机性出现目视上的差异（如公开 0.727 / 保留 0.826），但只要双比例检验不显著（p ≥ alpha），就落在统计噪声内、不报警——这正是污染判定要接显著性检验、而不能直接比大小的原因。
- **被污染场景**：模拟一个"背过公开集答案"的 agent，公开集通过率被抬高、且 canary 在输出里漏出。判定器接第 4 章的双比例显著性检验，把这种劈叉判成"疑似污染"。

类型检查：

```bash
npm run typecheck
```

## 文件

- `src/types.ts`——`EvalTask` / `TaskOracle` / `Range`，形状与第 5 章 adapter 一致。
- `src/generator.ts`——生成式任务模板（`makePoolExhaustTask`）+ 现场实例化（`generatePoolSuite`）+ 可复现随机源（`seededRng`）。把题目变"活"，模型背不到随机参数组合。
- `src/canary.ts`——给每题注入唯一 canary 串（`withCanary`）、扫模型输出的探针（`probeContamination`）。
- `src/split.ts`——用任务 id 的稳定哈希把任务集切成公开集 / 私有保留集（`splitSuite`），同一题永远落同一边、可复现。
- `src/stats.ts`——第 4 章的双比例显著性检验（`twoProportionZTest`），污染判定要用。
- `src/contamination.ts`——比对两集得分，判定是否疑似污染（`judgeContamination`）。
- `src/index.ts`——把整条流程串起来，对照"未污染 / 被污染"两个场景跑一遍。

## 和后续章节的衔接

这套任务集就是第 7 章整体效果评分的进料口：把 `index.ts` 里的桩 `stubRun` 换成第 5 章 `MastraOncallAdapter` 的 `adapter.run(task)`，任务、oracle、切分逻辑一行不用改，因为两边的 `EvalTask` 形状完全一致。
