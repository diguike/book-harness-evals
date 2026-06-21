// harness-lab/src/oncall-tools.ts —— DevOps 值班助手的工具，按 run 现造。
// 工厂函数把工具绑定到当次的 world 和 recorder：写操作真的改 world（终态才有意义），
// 每次调用都留痕（供安全检查、状态基评分、Ask-F1 用）。

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { WorldState, StepRecorder } from './world.js';

/**
 * 每次 run 传入隔离的 world 和 recorder，造一套绑定到当次运行的工具。
 * 返回的对象可直接喂给 Mastra Agent 的 tools 字段。
 */
export function buildOncallTools(world: WorldState, recorder: StepRecorder) {
  // 只读工具：查监控。安全，可放手让 agent 自调
  const queryMetrics = createTool({
    id: 'queryMetrics',
    description: '查询某服务的关键监控指标（如错误率）',
    inputSchema: z.object({ service: z.string() }),
    outputSchema: z.object({ value: z.number() }),
    // Mastra v1：execute 第一个参数就是校验后的输入
    execute: async (input) => {
      const value = world.metrics[input.service] ?? 0;
      recorder.record('queryMetrics', input, { value }, 'read'); // 只读查询
      return { value };
    },
  });

  // 只读工具：查日志
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

  // 只读工具：查值班手册 / 知识库。这里用 world.logs 做关键词过滤模拟知识库召回
  const searchRunbook = createTool({
    id: 'searchRunbook',
    description: '在值班手册 / 知识库里检索处置步骤',
    inputSchema: z.object({ keyword: z.string() }),
    outputSchema: z.object({ hits: z.array(z.string()) }),
    execute: async (input) => {
      // 简化：拿 world.logs 当语料做关键词召回，真实场景换成向量检索
      const hits = world.logs.filter((l) => l.includes(input.keyword));
      recorder.record('searchRunbook', input, { hits }, 'read'); // 只读查询
      return { hits };
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
      recorder.record('patchConfig', input, { ok: true }, 'write'); // 高危写操作
      return { ok: true };
    },
  });

  // 高危写工具：重启服务。改 world.services，终态可比对
  const restartService = createTool({
    id: 'restartService',
    description: '重启某个服务',
    inputSchema: z.object({ service: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    execute: async (input) => {
      world.services[input.service] = 'up'; // 真的改 world，终态才有意义
      recorder.record('restartService', input, { ok: true }, 'write'); // 高危写操作
      return { ok: true };
    },
  });

  // 升级给人类 oncall。被调用即产生一个 askEvent（第 13 章评 Ask-F1 用）
  const escalateOncall = createTool({
    id: 'escalateOncall',
    description: '把当前问题升级给人类 oncall',
    inputSchema: z.object({ reason: z.string() }),
    outputSchema: z.object({ escalated: z.boolean() }),
    execute: async (input) => {
      world.escalated = true;
      // 升级动作本身记为 kind='escalate'，并产出一条 kind='escalate' 的 askEvent
      const stepId = recorder.record('escalateOncall', input, { escalated: true }, 'escalate');
      recorder.recordAsk('escalate', input.reason, stepId);
      return { escalated: true };
    },
  });

  return { queryMetrics, queryLogs, searchRunbook, patchConfig, restartService, escalateOncall };
}

/** 工具 id 的集合类型，供 disabled 过滤用 */
export type OncallToolId = keyof ReturnType<typeof buildOncallTools>;
