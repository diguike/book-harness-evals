# 第 2 章配套代码

四个脚本，对应本章四组术语的核心计算。除 `code-vs-quality` 的 LLM judge 部分外，其余都不调模型、不需要 API key，直接能跑。

## 安装

```bash
npm install
```

## 1. 确定性评测 vs 质量评测

```bash
npm run code-vs-quality
```

同一个值班场景，一边用确定性 code scorer 判"配置改对没有"（零方差），一边用 LLM judge 评"升级说明写得清不清楚"（有方差）。两个 scorer 都按 Mastra `createScorer` 的真实形状写（code 型 / agent 型 judge）。确定性部分直接跑；judge 部分需配模型 API key 才能真正打分，未配 key 也能读懂两种判定方式的形状差异。

## 2. pass@k vs pass^k

```bash
npm run passk
```

算 pass@k（至少成一次，乐观）和 pass^k（每次都成，悲观），再用蒙特卡洛模拟一个会抖动的多步任务，亲眼看 pass^k 怎么随步数掉下去——3 步全过只剩 0.729。

## 3. 消融不可加

```bash
npm run ablation
```

玩具版消融：三个模块逐个关掉算 Δi = Φ(H) − Φ(H−i)，再把 ΣΔi 和整体提升摆一起，看它们不相等——模块交互导致消融 Δ 不可加，这是第 10 章 Shapley 存在的理由。

## 4. Wilson 置信区间

```bash
npm run wilson
```

对 46/50 这种小样本算 Wilson 95% 置信区间，并和教科书正态近似对比，看小样本/极端比例下后者怎么失真（甚至越过 100%）。报分必带 CI。

> 说明：示例代码对照 Mastra 真实 API 编写——`createScorer` 的 `type` 只有 `'agent'` / `'trajectory'`，区分 code 与 LLM 判定靠"有没有 `judge` 字段"，不是 type 枚举。`model` 用占位符写法，跑 judge 之前替换成你实际可用的模型与 key。端到端运行验证统一在全书 `verify-code` 阶段做。
