# 第 1 章配套代码

两个脚本，对应本章两个核心论点。

## 安装

```bash
npm install
```

## 1. 看清 model 与 harness 的边界

```bash
npm run boundary
```

把 DevOps 值班助手拆开打印，直观看到"模型只占一行 `model`，其余全是 harness"。这个脚本不调用模型，不需要 API key。

## 2. 看清 Mastra scorer 的边界

```bash
# 需要先配置模型 API key（scorer 内部用 LLM 当 judge）
export OPENAI_API_KEY=sk-...
npm run scorer
```

跑一个 Mastra 自带的 answer-relevancy scorer，看到它的输入只有"一问一答"，从而理解它评的是单条输出、评不了整个 harness 的系统级行为。没配 key 也能读源码理解它的输入输出形状。

> 说明：示例代码对照 Mastra 真实 API 编写（`new Agent` / `createTool` / `createScorer`）。`model` 用占位符写法，跑之前替换成你实际可用的模型与 key。代码的端到端运行验证统一在全书 `verify-code` 阶段做。
