// world.ts —— 一次 run 的隔离环境状态 + 留痕器（与第 5 章同一份，与载体无关）。
// 任何载体的 adapter 都复用它：换 harness 不需要重写 world 和 StepRecorder。

import type { OtarNode, StepRecord, AskEvent } from './adapter.js';

/** 一次 run 的环境状态：写操作改这里，run 结束后作为 finalState 读出 */
export interface WorldState {
  configs: Record<string, string>; // 当前配置（patchConfig 改这里）
  services: Record<string, 'up' | 'down'>; // 服务状态
  escalated: boolean; // 是否已升级给人
  logs: string[]; // 只读日志桩
  metrics: Record<string, number>; // 只读监控桩
}

/** 从任务初始态构造一份全新的、隔离的 world（深拷贝，避免并发回放串台） */
export function createWorld(initialState?: unknown): WorldState {
  const init = (initialState ?? {}) as Partial<WorldState>;
  return {
    configs: { ...(init.configs ?? {}) },
    services: { ...(init.services ?? {}) },
    escalated: init.escalated ?? false,
    logs: [...(init.logs ?? [])],
    metrics: { ...(init.metrics ?? {}) },
  };
}

/**
 * StepRecorder：执行过程中把每一步动作留痕，run 结束后产出
 * RunResult 需要的 steps / trace / askEvents 三块规整数据。
 * 任何载体（Mastra / stub / LangGraph）都把留痕走这里，trace 就自动对齐 OTAR。
 */
export class StepRecorder {
  readonly steps: StepRecord[] = [];
  readonly askEvents: AskEvent[] = [];

  /**
   * 记一步动作：动作名、参数、返回、动作类别，返回这一步的 id。
   * kind 决定下游怎么处理这一步：write 进安全检查、escalate 触发一条 ask 事件。
   */
  record(action: string, args: unknown, result: unknown, kind: StepRecord['kind']): string {
    const id = `s${this.steps.length}`;
    this.steps.push({ id, kind, action, args, result, ts: Date.now() });
    return id;
  }

  /**
   * 记一条 ask / 升级事件，stepId 关联到刚记下的那一步（第 13 章 Ask-F1 的数据来源）。
   * payload 对齐 AskEvent.payload：携带结构化上下文（如待确认的写操作 diff），可选。
   */
  recordAsk(
    kind: AskEvent['kind'],
    question: string,
    stepId?: string,
    payload?: unknown,
  ): void {
    this.askEvents.push({
      id: `e${this.askEvents.length}`,
      kind,
      question,
      payload,
      stepId,
      ts: Date.now(),
    });
  }

  /** 把动作序列规整成最简 OTAR：每步一个 action 节点，因果上串成一条链（第 8 章升级成完整 DAG） */
  toOtar(): OtarNode[] {
    const nodes: OtarNode[] = [];
    let prevId: string | undefined;
    for (const s of this.steps) {
      const id = `a${s.id}`;
      nodes.push({
        id,
        kind: 'action',
        content: { action: s.action, args: s.args, result: s.result },
        causedBy: prevId ? [prevId] : [],
        module: s.action, // 工具 id 即模块 id，与 modules() / StepRecord.action 同名，归因才对得上
        ts: s.ts,
      });
      prevId = id;
    }
    return nodes;
  }
}
