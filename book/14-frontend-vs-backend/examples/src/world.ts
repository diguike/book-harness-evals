// world.ts —— 一次 run 的隔离环境 + 动作留痕。前后端两轨共用，保证两轨评的是同一套世界。

import type { WorldStateLike, StepRecord, AskEvent, OtarNode, Turn, RunResult } from './adapter.js';

/** 从任务初始态构造一份全新的、隔离的 world（深拷贝，避免不同 run 串台） */
export function createWorld(initialState?: unknown): WorldStateLike {
  const init = (initialState ?? {}) as Partial<WorldStateLike>;
  return {
    configs: { ...(init.configs ?? {}) },
    escalated: init.escalated ?? false,
    logs: [...(init.logs ?? [])],
    metrics: { ...(init.metrics ?? {}) },
  };
}

/** 执行过程留痕：把动作、对话、问人事件攒起来，run 结束后产出 RunResult */
export class StepRecorder {
  readonly steps: StepRecord[] = [];
  readonly askEvents: AskEvent[] = [];
  readonly transcript: Turn[] = [];
  tokens = 0;

  record(action: string, args: unknown, result: unknown, kind: StepRecord['kind']): void {
    this.steps.push({ id: `s${this.steps.length}`, kind, action, args, result, ts: Date.now() });
  }

  recordAsk(question: string): void {
    // 关联到刚记下的那一步（如果有），便于第 13 章按时机评测
    const stepId = this.steps.length > 0 ? this.steps[this.steps.length - 1].id : undefined;
    this.askEvents.push({
      id: `e${this.askEvents.length}`,
      kind: 'escalate',
      question,
      stepId,
      ts: Date.now(),
    });
  }

  say(role: 'user' | 'agent', text: string): void {
    this.transcript.push({ role, text });
  }

  /** 把动作序列规整成最简 OTAR 链（第 8 章升级成完整 DAG） */
  toOtar(): OtarNode[] {
    const nodes: OtarNode[] = [];
    let prev: string | undefined;
    for (const s of this.steps) {
      const id = `a${s.id}`;
      nodes.push({
        id,
        kind: 'action',
        content: { action: s.action, args: s.args, result: s.result },
        causedBy: prev ? [prev] : [],
        module: s.action,
        ts: Date.now(),
      });
      prev = id;
    }
    return nodes;
  }

  toRunResult(
    taskId: string,
    world: WorldStateLike,
    ms: number,
    status: RunResult['status'] = 'success',
  ): RunResult {
    return {
      taskId,
      status,
      finalState: world,
      steps: this.steps,
      trace: this.toOtar(),
      askEvents: this.askEvents,
      transcript: this.transcript,
      cost: { tokens: this.tokens, ms },
    };
  }
}
