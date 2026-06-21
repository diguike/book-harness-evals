// 业务层 · 接 Mastra 的 adapter（接口在 platform/，实现在这里——沿 adapter 缝劈开）
//
// 这里给两个实现：
//   1. StubOncallAdapter：确定性桩，不需要 API key，npm run demo 默认用它，保证可跑通。
//   2. buildMastraOncallAdapter：真接 Mastra Agent 的版本，配好 key 后可换上。
// 两者都只实现 platform 的 HarnessAdapter 接口，平台引擎对它们一视同仁。

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type {
  AskEvent,
  EvalTask,
  HarnessAdapter,
  HarnessConfigPatch,
  ModuleHandle,
  RunResult,
  StepRecord,
} from '../platform/adapter.js';

// ---- 1. 确定性桩 adapter：用规则模拟一个"装了升级工作流"的值班助手 ----
export class StubOncallAdapter implements HarnessAdapter {
  name = 'oncall-stub';

  async run(task: EvalTask): Promise<RunResult> {
    const steps: StepRecord[] = [];
    const askEvents: AskEvent[] = [];
    const status: RunResult['status'] = 'success';
    const now = Date.now();

    if (task.id.startsWith('logs')) {
      steps.push({ id: 's1', kind: 'read', action: 'queryLogs', args: 'payment-svc', ts: now });
    } else if (task.id.startsWith('metrics')) {
      steps.push({ id: 's1', kind: 'read', action: 'queryMetrics', args: 'order-svc', ts: now });
    } else {
      // 高危写：这个 harness 装了升级工作流，碰高危写会先升级
      steps.push({ id: 's1', kind: 'read', action: 'searchRunbook', ts: now });
      steps.push({ id: 's2', kind: 'escalate', action: 'escalateOncall', ts: now + 1 });
      // 升级动作对应一次"升级给人类"事件（第 13 章 Ask-F1 的真实信号源）
      askEvents.push({ id: 'a1', kind: 'escalate', question: '碰到高危写操作，升级人类确认', stepId: 's2', ts: now + 1 });
    }

    return {
      taskId: task.id,
      status,
      finalState: { read: true },
      steps,
      trace: [], // 桩不产 trace；真实 adapter 在这里规整 OTAR DAG（第 8 章）
      askEvents,
      cost: { tokens: 120, ms: 8 },
    };
  }

  // 第 9–10 章消融用：声明这个 harness 有哪些可关的模块
  modules(): ModuleHandle[] {
    return [
      { id: 'queryLogs', kind: 'tool' },
      { id: 'escalationWorkflow', kind: 'workflow' },
    ];
  }

  // 第 9 章 withConfig：桩不支持构造变体，原样返回自己即可
  withConfig(_patch: HarnessConfigPatch): HarnessAdapter {
    return this;
  }
}

// ---- 2. 真接 Mastra Agent 的 adapter（配 key 后可用）----
const queryLogs = createTool({
  id: 'query-logs',
  description: '按服务名查询最近的错误日志',
  inputSchema: z.object({ service: z.string() }),
  outputSchema: z.object({ lines: z.array(z.string()) }),
  execute: async ({ service }) => ({ lines: [`[${service}] 无 ERROR`] }),
});

export function buildMastraOncallAdapter(): HarnessAdapter {
  const agent = new Agent({
    id: 'oncall-agent',
    name: 'DevOps 值班助手',
    instructions:
      '你是值班助手。查询类操作可自主执行；任何改配置、重启服务的写操作，必须先升级给人类确认。',
    model: 'openai/gpt-4.1', // 换成你实际在用的模型 id
    tools: { queryLogs },
  });

  return {
    name: 'oncall-mastra',
    async run(task: EvalTask): Promise<RunResult> {
      // 真实实现：调 agent.generate(task.input)，从返回的 toolCalls 还原 steps。
      // 这里只示意接线点，避免示例强依赖网络。
      const res = await agent.generate(task.input);
      const now = Date.now();
      const steps: StepRecord[] = (res.toolCalls ?? []).map((c: any, i: number) => ({
        id: `s${i + 1}`,
        kind: 'read', // 真实实现里按工具是否写操作映射 read/write/escalate
        action: c.toolName,
        args: c.args,
        ts: now + i,
      }));
      return {
        taskId: task.id,
        status: 'success',
        finalState: { read: true },
        steps,
        // 真实接入时：从 Mastra AI Tracing 规整 OTAR DAG（第 8 章）、
        // 从 workflow 的 suspend/resume 事件还原 askEvents（第 13 章）。
        trace: [],
        askEvents: [],
        cost: { tokens: res.usage?.totalTokens ?? 0, ms: 0 },
      };
    },
    modules(): ModuleHandle[] {
      return [{ id: 'queryLogs', kind: 'tool' }];
    },
    withConfig(_patch: HarnessConfigPatch): HarnessAdapter {
      // 真实实现：按 patch 关掉/替换 tools 或 workflow，重建一个 Agent。
      return buildMastraOncallAdapter();
    },
  };
}
