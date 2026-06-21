// world.ts —— 一次 run 的隔离环境状态（对齐第 5 章 harness-lab/world.ts 的形状）。
// 每次 run 独立一份，工具读写这份隔离副本，并发回放时互不串台。

import type { OtarNode, StepRecord, AskEvent } from './adapter.js';

/** 一次 run 的环境状态：写操作改这里，run 结束后作为 finalState 读出 */
export interface WorldState {
  configs: Record<string, string>; // 当前配置
  services: Record<string, 'up' | 'down'>; // 服务状态
  escalated: boolean; // 是否已升级给人（本章评分看这个）
  logs: string[]; // 只读日志桩
  metrics: Record<string, number>; // 只读监控桩：服务名 -> 错误率
  runbook: Record<string, 'should-escalate' | 'self-heal'>; // 只读 runbook 桩：服务名 -> 已知故障处置先验
}

/** 从任务初始态构造一份全新的、隔离的 world */
export function createWorld(initialState?: unknown): WorldState {
  const init = (initialState ?? {}) as Partial<WorldState>;
  return {
    // 深拷贝，避免不同 run 共享同一份初始态对象
    configs: { ...(init.configs ?? {}) },
    services: { ...(init.services ?? {}) },
    escalated: init.escalated ?? false,
    logs: [...(init.logs ?? [])],
    metrics: { ...(init.metrics ?? {}) },
    runbook: { ...(init.runbook ?? {}) },
  };
}

/**
 * StepRecorder：执行过程中把每一步动作留痕，run 结束后产出
 * RunResult 需要的 steps / trace / askEvents 三块规整数据。
 */
export class StepRecorder {
  readonly steps: StepRecord[] = [];
  readonly askEvents: AskEvent[] = [];

  /** 记一步动作：动作名、参数、返回、动作类型（read=只读查询，write=写操作）。 */
  record(
    action: string,
    args: unknown,
    result: unknown,
    kind: StepRecord['kind'],
  ): void {
    this.steps.push({
      id: `s${this.steps.length}`,
      kind,
      action,
      args,
      result,
      ts: Date.now(),
    });
  }

  /** 记一条升级事件，关联到当前最后一步。 */
  recordAsk(question: string): void {
    const last = this.steps[this.steps.length - 1];
    this.askEvents.push({
      id: `e${this.askEvents.length}`,
      kind: 'escalate',
      question,
      stepId: last?.id,
      ts: Date.now(),
    });
  }

  /** 把动作序列规整成最简 OTAR：每步一个 action 节点，串成一条因果链 */
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
        module: s.action,
        ts: Date.now(),
      });
      prevId = id;
    }
    return nodes;
  }
}
