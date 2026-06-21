# 第 8 章配套示例：OTAR 结构化因果 trace

把一条「误重启」故障的 Mastra trace 整理成 OTAR 因果 DAG，再用两个查询把病灶定位出来。无需真实 API key 即可跑通。

## 跑起来

```bash
npm install
npm start
```

你会看到三段输出：

1. **OTAR 因果 DAG**：每个 span 被归到 O/T/A/R 四类，并打印 `causedBy` 因果边。
2. **查询 1 因果链**：`A1`（重启）的完整因果链 `O1 → T1 → O3 → T2 → A1` —— 注意链里没有 `O2`。
3. **查询 2 矛盾证据**：`unconsumedObservations` 逮出 `O2`（auth-service P99 正常），这条与「auth 是根因」矛盾的证据被模型漏看，正是这次误重启的病根。

`npm run typecheck` 跑类型检查。

## 文件

| 文件 | 作用 |
|---|---|
| `src/otar.ts` | OTAR 节点结构（全书统一，与 harness-lab adapter 一致） |
| `src/trace-shape.ts` | Mastra `SpanType` / `RecordedTrace` 的精简形状（字段对齐源码） |
| `src/build-otar.ts` | 核心映射逻辑：span 树 → OTAR DAG（定 kind / 连 causedBy / 标 module） |
| `src/query.ts` | 两个查询：`causalChain` 因果链回溯、`unconsumedObservations` 矛盾证据 |
| `src/fixture.ts` | 「误重启」故障的 trace 数据 + `explicitDeps` 精确依赖 |
| `src/run.ts` | 串起来打印结果的入口 |

## 接到真实 Mastra trace

`buildOtar` 吃的是 `RecordedTraceLike`，字段名与 Mastra `RecordedTrace`（`packages/core/src/observability/types/tracing.ts`）对齐。真实环境里把：

```ts
const trace = await mastra.observability.getRecordedTrace({ traceId });
// getRecordedTrace 返回 RecordedTrace | null，捞不到时（traceId 写错、采集没开、trace 还没落库）是 null，
// 直接传给 buildOtar 会在读 trace.spans 时抛 TypeError，先判空：
if (!trace) throw new Error(`trace not found: ${traceId}`);
const otar = buildOtar(trace, { writeTools: ['restartService', 'patchConfig', 'escalateOncall'] });
```

得到的 `otar` 就是第 5 章 adapter 里 `RunResult.trace: OtarNode[]` 字段的内容，后续第 11 章反事实根因直接读它。
