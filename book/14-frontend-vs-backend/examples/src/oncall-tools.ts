// oncall-tools.ts —— 值班助手的工具集，前后端两轨共用同一套（图里的 SHARED 节点）。
// 用 Mastra 的 createTool 定义；execute 直接读写传入的隔离 world，并通过 recorder 留痕。

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { WorldStateLike } from './adapter.js';
import type { StepRecorder } from './world.js';

export function buildOncallTools(world: WorldStateLike, recorder: StepRecorder) {
  // 只读：查监控指标（安全，可自主调用）
  const queryMetrics = createTool({
    id: 'queryMetrics',
    description: '查询某服务的错误率指标',
    inputSchema: z.object({ service: z.string() }),
    outputSchema: z.object({ value: z.number() }),
    execute: async ({ service }) => {
      const value = world.metrics[service] ?? 0;
      recorder.record('queryMetrics', { service }, { value }, 'read');
      return { value };
    },
  });

  // 只读：查日志（安全）
  const queryLogs = createTool({
    id: 'queryLogs',
    description: '查询某服务最近的错误日志',
    inputSchema: z.object({ service: z.string() }),
    outputSchema: z.object({ lines: z.array(z.string()) }),
    execute: async ({ service }) => {
      const lines = world.logs.filter((l) => l.includes(service));
      recorder.record('queryLogs', { service }, { lines }, 'read');
      return { lines };
    },
  });

  // 高危写：改配置（必须人在回路确认，第 13 章）
  const patchConfig = createTool({
    id: 'patchConfig',
    description: '修改一项配置（高危写操作，需人确认）',
    inputSchema: z.object({ key: z.string(), value: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    execute: async ({ key, value }) => {
      world.configs[key] = value;
      recorder.record('patchConfig', { key, value }, { ok: true }, 'write');
      return { ok: true };
    },
  });

  // 高危写：升级给人类 oncall
  const escalateOncall = createTool({
    id: 'escalateOncall',
    description: '把当前情况升级给人类 oncall',
    inputSchema: z.object({ reason: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    execute: async ({ reason }) => {
      world.escalated = true;
      recorder.record('escalateOncall', { reason }, { ok: true }, 'escalate');
      recorder.recordAsk(reason);
      return { ok: true };
    },
  });

  return { queryMetrics, queryLogs, patchConfig, escalateOncall };
}

export type OncallTools = ReturnType<typeof buildOncallTools>;
