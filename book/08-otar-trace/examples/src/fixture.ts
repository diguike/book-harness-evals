import { SpanType, makeTrace, type RecordedTraceLike } from './trace-shape.js';

/**
 * 本章「误重启」故障的 trace（Mastra RecordedTrace 形状）。
 *
 * 时间线（对应正文那份扁平日志）：
 *   queryLogs(payment-api)        → 观察 O1
 *   model: 错误集中在 auth        → 思考 T1
 *   queryMetrics(auth-service)    → 观察 O2（P99 正常，与「auth 是根因」矛盾）
 *   searchRunbook(5xx)            → 观察 O3
 *   model: 判定根因=auth，决定重启 → 思考 T2
 *   restartService(payment-api)   → 动作 A1（写操作）→ 派生结果 R1
 *
 * 关键：T2 发生在 O2 之后，但本章启发式规则会把 O2/O3 都喂给 T2 当依据。
 * 为了复现「模型漏看了 O2」这个真实病灶，fixture 用 explicitDeps 精确声明
 * T2 实际依据的是 T1（上一轮结论「错误集中在 auth」）+ O3（runbook），没采纳 O2 ——
 * 这正是矛盾证据查询要逮的对象。
 */

const spans = [
  { id: 'root', type: SpanType.AGENT_RUN, startTime: 0 },

  // O1 观察：查 payment-api 日志
  {
    id: 'O1',
    parentSpanId: 'root',
    type: SpanType.TOOL_CALL,
    entityId: 'queryLogs',
    input: { service: 'payment-api' },
    output: { lines: 1873, summary: '错误集中在 auth 调用栈' },
    startTime: 100,
  },
  // T1 思考：错误集中在 auth
  {
    id: 'T1',
    parentSpanId: 'root',
    type: SpanType.MODEL_GENERATION,
    output: '日志里错误集中在 auth 调用栈，先查一下 auth-service。',
    startTime: 200,
  },
  // O2 观察：查 auth-service 监控 —— P99 正常（矛盾证据）
  {
    id: 'O2',
    parentSpanId: 'root',
    type: SpanType.TOOL_CALL,
    entityId: 'queryMetrics',
    input: { service: 'auth-service' },
    output: { p99LatencyMs: 42, status: 'auth-service P99 正常' },
    startTime: 300,
  },
  // O3 观察：查 runbook
  {
    id: 'O3',
    parentSpanId: 'root',
    type: SpanType.TOOL_CALL,
    entityId: 'searchRunbook',
    input: { query: 'payment-api 5xx' },
    output: { docs: 3 },
    startTime: 400,
  },
  // T2 思考：判定根因=auth，决定重启（误判：无视了 O2）
  {
    id: 'T2',
    parentSpanId: 'root',
    type: SpanType.MODEL_GENERATION,
    output: '判定根因是 auth-service 超时，决定重启 payment-api，无需升级。',
    startTime: 500,
  },
  // A1 动作：重启 payment-api（写操作）
  {
    id: 'A1',
    parentSpanId: 'root',
    type: SpanType.TOOL_CALL,
    entityId: 'restartService',
    input: { service: 'payment-api' },
    output: { restarted: true },
    startTime: 600,
  },
];

export const failedRestartTrace: RecordedTraceLike = makeTrace('trace-misrestart-001', spans);

/**
 * 精确引用覆盖：T2 实际依据 T1（上一轮结论）+ O3（runbook），漏看了 O2（P99 正常）。
 * 这一行就是真实场景里 harness 从模型消息历史 / tool-call 参数解析出的精确依赖。
 * 不传它，启发式会把 O2/O3 都算进 T2 的依据，矛盾证据就被「假装采纳」掉了。
 */
export const explicitDeps = { T2: ['T1', 'O3'] };
