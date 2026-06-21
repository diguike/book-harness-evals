/**
 * Mastra AI Tracing 的 trace 形状（精简版）。
 *
 * 字段名与 Mastra 源码对齐，便于把真实 trace 直接喂进 buildOtar：
 *   - SpanType            见 packages/core/src/observability/types/tracing.ts 的 SpanType 枚举
 *   - ExportedSpan        见 同文件 SpanData/ExportedSpan，含 id/parentSpanId/type/input/output/startTime/errorInfo
 *   - RecordedTrace       见 同文件 RecordedTrace，含 traceId/spans/getSpan
 *
 * 真实环境里这些对象由 mastra.observability.getRecordedTrace({ traceId }) 返回；
 * 这里只声明 buildOtar 实际读到的字段，方便无 API key 跑通。
 */

/** 与 Mastra SpanType 枚举对齐，只列值班助手用得到的几类 */
export enum SpanType {
  AGENT_RUN = 'agent_run',
  MODEL_GENERATION = 'model_generation',
  TOOL_CALL = 'tool_call',
  WORKFLOW_STEP = 'workflow_step',
  MEMORY_OPERATION = 'memory_operation',
}

/** 一个 span 的精简形状（对齐 Mastra ExportedSpan 的相关字段） */
export interface TraceSpan {
  id: string;
  parentSpanId?: string;
  type: SpanType;
  /** Mastra span 用 entityId/工具 id 标识产生它的模块 */
  entityId?: string;
  input?: unknown;
  output?: unknown;
  /** 对齐 Mastra：startTime 是 Date；这里用 epoch ms 数字，跑示例更省事 */
  startTime: number;
  errorInfo?: { message: string };
}

/** 与 Mastra RecordedTrace 对齐的精简形状 */
export interface RecordedTraceLike {
  traceId: string;
  spans: TraceSpan[];
  getSpan(spanId: string): TraceSpan | null;
}

/** 把一组 span 包成 RecordedTraceLike（getSpan 用 Map 实现） */
export function makeTrace(traceId: string, spans: TraceSpan[]): RecordedTraceLike {
  const byId = new Map(spans.map((s) => [s.id, s]));
  return {
    traceId,
    spans,
    getSpan: (id) => byId.get(id) ?? null,
  };
}
