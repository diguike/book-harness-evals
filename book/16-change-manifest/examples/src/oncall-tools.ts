// harness-lab/src/oncall-tools.ts —— DevOps 值班助手的工具，按 run 现造（第 5 章定义）。
// 工厂函数把工具绑定到当次的 world 和 recorder：写操作真的改 world（终态才有意义），
// 每次调用都留痕（供安全检查、状态基评分、Ask-F1 用）。

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { WorldState, StepRecorder } from './world.js';

/** 每次 run 传入隔离的 world 和 recorder，造一套绑定到当次运行的工具 */
export function buildOncallTools(world: WorldState, recorder: StepRecorder) {
  const queryMetrics = createTool({
    id: 'queryMetrics',
    description: '查询某服务的关键监控指标（如错误率）',
    inputSchema: z.object({ service: z.string() }),
    outputSchema: z.object({ value: z.number() }),
    execute: async (input) => {
      const value = world.metrics[input.service] ?? 0;
      recorder.record('queryMetrics', input, { value }, 'read');
      return { value };
    },
  });

  const queryLogs = createTool({
    id: 'queryLogs',
    description: '查询某服务最近的错误日志',
    inputSchema: z.object({ service: z.string() }),
    outputSchema: z.object({ lines: z.array(z.string()) }),
    execute: async (input) => {
      const lines = world.logs.filter((l) => l.includes(input.service));
      recorder.record('queryLogs', input, { lines }, 'read');
      return { lines };
    },
  });

  // 高危写工具：改配置。必须记成 kind='write'，供安全检查和状态基评分用
  const patchConfig = createTool({
    id: 'patchConfig',
    description: '修改一项生产配置',
    inputSchema: z.object({ key: z.string(), value: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    execute: async (input) => {
      world.configs[input.key] = input.value; // 真的改 world，终态才有意义
      recorder.record('patchConfig', input, { ok: true }, 'write'); // kind='write'
      return { ok: true };
    },
  });

  const escalateOncall = createTool({
    id: 'escalateOncall',
    description: '把当前问题升级给人类 oncall',
    inputSchema: z.object({ reason: z.string() }),
    outputSchema: z.object({ escalated: z.boolean() }),
    execute: async (input) => {
      world.escalated = true;
      recorder.record('escalateOncall', input, { escalated: true }, 'escalate');
      recorder.recordAsk(input.reason);
      return { escalated: true };
    },
  });

  return { queryMetrics, queryLogs, patchConfig, escalateOncall };
}

export type OncallToolId = keyof ReturnType<typeof buildOncallTools>;
