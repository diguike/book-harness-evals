# 第 4 章配套代码

把评测当成统计实验的几个核心动作，都做成了可独立运行的脚本。三个脚本默认都不调用真实模型、不需要 API key。

## 安装

```bash
npm install
```

## 1. 统计工具箱演示

```bash
npm run stats
```

跑一遍 `stats.ts` 里的几个函数，复现正文里的关键数字：50 条过 41 条的 Wilson 区间宽到 0.21、想分辨 0.02 提升要约 6000 条样本、A/B 差 0.02 时 p 值约 0.80。

## 2. judge 噪声估计

```bash
npm run judge
```

对同一条样本让 judge 重复打 8 次分，对比"高噪声 judge（模拟温度偏高）"和"低噪声 judge（温度=0 + 多数票）"的标准差，看清 judge 自己的抖动有多大、为什么能压就该压。默认用带噪声的假 judge 模拟，真实用法是把 `makeFakeJudge` 换成一个调用 Mastra LLM scorer 的函数，形状一致。

## 3. 完整 A/B 评测实验

```bash
npm run ab
```

按正文那张 flowchart 的顺序走一遍：定 MDE → 算样本量 → 固定 seed → 两版各跑任务集 → Wilson 区间 → 双比例 z 检验 → 报分带区间。脚本里用一个内存桩模拟第 5 章会正式定义的 `HarnessAdapter`（`run(task, { seed })`），第 5 章会把它换成真的 `MastraOncallAdapter`。你会亲眼看到：B 版真实通过率比 A 版高 2 个百分点，但在 50 条样本下，这点差距在统计上根本分不出来。

## 文件说明

| 文件 | 作用 |
|---|---|
| `src/stats.ts` | Wilson 区间 / 样本量估算 / 双比例 z 检验 / Bonferroni 校正 / 正态 CDF |
| `src/stats-demo.ts` | 上面这些函数的演示，复现正文数字 |
| `src/judge-noise.ts` | 重复采样估 judge 噪声 |
| `src/ab-experiment.ts` | 串成一次完整 A/B 实验，用内存桩模拟第 5 章 adapter |

> 说明：`stats.ts` 是纯计算工具，后续第 7、12、15、16 章报分时会复用同样的形状。示例代码的端到端运行验证统一在全书 `verify-code` 阶段做。
