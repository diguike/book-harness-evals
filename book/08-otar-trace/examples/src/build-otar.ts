import type { OtarNode } from './otar.js';
import { SpanType, type RecordedTraceLike, type TraceSpan } from './trace-shape.js';

/**
 * 把 Mastra 的 RecordedTrace（精简形状）整理成 OTAR 因果 DAG。
 *
 * 三步（对应正文「从 span 树到 OTAR：映射规则」）：
 *   1. 按 SpanType + 写操作清单给每个 span 定 kind（observation/thought/action）；
 *      Action 的 output 再派生一个 result 节点。
 *   2. 连 causedBy（启发式：新观察喂给最近一次思考；动作由触发它的思考引出；
 *      结果由产生它的动作引出）。可被精确引用覆盖，见 explicitDeps 参数。
 *   3. 用 entityId / 工具 id 标 module。
 */

export interface BuildOtarOptions {
  /** harness 侧维护的写操作清单：这些工具是有副作用的 Action，其余 TOOL_CALL 视为 Observation */
  writeTools?: string[];
  /**
   * 精确引用覆盖：thought 节点 id -> 它实际依据的 observation 节点 id 列表。
   * 若 harness 能从模型 tool-call 参数 / 消息历史里拿到精确引用，传进来覆盖启发式推断。
   */
  explicitDeps?: Record<string, string[]>;
}

const DEFAULT_WRITE_TOOLS = ['restartService', 'patchConfig', 'escalateOncall'];

/** 取产生该 span 的模块标识：优先 entityId，回退到 id */
function moduleOf(span: TraceSpan): string | undefined {
  return span.entityId ?? undefined;
}

export function buildOtar(trace: RecordedTraceLike, opts: BuildOtarOptions = {}): OtarNode[] {
  const writeTools = new Set(opts.writeTools ?? DEFAULT_WRITE_TOOLS);
  const explicitDeps = opts.explicitDeps ?? {};

  // 按时间排序，保证「最近一次思考」「之前的观察」这类时序判断成立
  const spans = [...trace.spans]
    .filter((s) => s.type !== SpanType.AGENT_RUN) // 根 span 不产生 OTAR 节点
    .sort((a, b) => a.startTime - b.startTime);

  const nodes: OtarNode[] = [];

  // —— 第一步：给每个 span 定 kind，建出 O/T/A，Action 再派生 R ——
  // 同时维护两个游标，供第二步连边用：
  //   pendingObs   : 已产生、尚未被任何 thought 消费的 observation id
  //   lastThoughtId: 最近一次 thought 的 id
  const pendingObs: string[] = [];
  let lastThoughtId: string | undefined;

  for (const span of spans) {
    const mod = moduleOf(span);

    if (span.type === SpanType.MODEL_GENERATION) {
      // Thought：依据 = 精确引用 ?? 之前未被消费的观察
      const causedBy =
        explicitDeps[span.id] ?? [...pendingObs];
      const node: OtarNode = {
        id: span.id,
        kind: 'thought',
        content: span.output,
        causedBy,
        module: mod,
        ts: span.startTime,
      };
      nodes.push(node);
      // 清空 pendingObs：这些观察已归到本次思考的 causedBy 名下，算被消费。
      // 不清空的话，它们会被下一次思考重复算作依据，causedBy 就连错了。
      pendingObs.length = 0;
      lastThoughtId = span.id;
      continue;
    }

    if (span.type === SpanType.MEMORY_OPERATION) {
      // 记忆召回也是观察
      nodes.push({ id: span.id, kind: 'observation', content: span.output, causedBy: [], module: mod, ts: span.startTime });
      pendingObs.push(span.id);
      continue;
    }

    if (span.type === SpanType.TOOL_CALL) {
      const isWrite = mod ? writeTools.has(mod) : false;
      if (isWrite) {
        // Action：由最近一次思考引出
        const actionNode: OtarNode = {
          id: span.id,
          kind: 'action',
          content: span.input,
          causedBy: lastThoughtId ? [lastThoughtId] : [],
          module: mod,
          ts: span.startTime,
        };
        nodes.push(actionNode);
        // Result：由该 Action 派生，记录回执 / 报错
        nodes.push({
          id: `${span.id}:result`,
          kind: 'result',
          content: span.errorInfo ? { error: span.errorInfo.message } : span.output,
          causedBy: [span.id],
          module: mod,
          ts: span.startTime + 1,
        });
      } else {
        // 只读工具 = Observation
        nodes.push({ id: span.id, kind: 'observation', content: span.output, causedBy: [], module: mod, ts: span.startTime });
        pendingObs.push(span.id);
      }
      continue;
    }

    // 其余类型（workflow_step 等）这里不展开，按需扩展
  }

  return nodes;
}
