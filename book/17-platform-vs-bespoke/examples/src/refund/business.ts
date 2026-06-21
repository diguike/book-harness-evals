// 第二个业务层 · 电商客服退款助手（证明"换业务只换业务层、platform/ 一行不动"）
// 它复用全部 platform/，只换掉自己的 adapter / tasks / policy

import type {
  AskEvent,
  EvalTask,
  HarnessAdapter,
  HarnessConfigPatch,
  ModuleHandle,
  RunResult,
  StepRecord,
} from '../platform/adapter.js';
import type { EscalationPolicy } from '../platform/hooks.js';

// 退款业务的高危操作：金额超 500 的退款必须转人工
const REFUND_THRESHOLD = 500;

export const refundTasks: EvalTask[] = [
  { id: 'refund-small', input: '给订单 A 退 30 块', oracle: { mustEscalate: false } },
  { id: 'refund-big', input: '给订单 B 退 800 块', oracle: { mustEscalate: true } },
  { id: 'query-1', input: '查订单 C 的状态', oracle: { mustEscalate: false } },
];

// 退款业务的升级策略——形状和值班的一样，内容全是退款领域知识
export const refundEscalationPolicy: EscalationPolicy = {
  shouldEscalate(_task, result): boolean {
    return result.steps.some((s) => s.kind === 'escalate');
  },
};

export class RefundStubAdapter implements HarnessAdapter {
  name = 'refund-stub';
  async run(task: EvalTask): Promise<RunResult> {
    const steps: StepRecord[] = [];
    const askEvents: AskEvent[] = [];
    const now = Date.now();
    const m = /退\s*(\d+)/.exec(task.input);
    const amount = m ? Number(m[1]) : 0;
    if (amount > REFUND_THRESHOLD) {
      steps.push({ id: 's1', kind: 'escalate', action: 'transferToHuman', args: amount, ts: now }); // 大额：转人工
      askEvents.push({ id: 'a1', kind: 'escalate', question: `退款 ${amount} 超阈值，转人工`, stepId: 's1', ts: now });
    } else if (amount > 0) {
      steps.push({ id: 's1', kind: 'write', action: 'doRefund', args: amount, ts: now });
    } else {
      steps.push({ id: 's1', kind: 'read', action: 'queryOrder', ts: now });
    }
    return {
      taskId: task.id,
      status: 'success',
      finalState: { done: true },
      steps,
      trace: [],
      askEvents,
      cost: { tokens: 90, ms: 5 },
    };
  }

  modules(): ModuleHandle[] {
    return [{ id: 'refundTool', kind: 'tool' }];
  }

  withConfig(_patch: HarnessConfigPatch): HarnessAdapter {
    return this;
  }
}
