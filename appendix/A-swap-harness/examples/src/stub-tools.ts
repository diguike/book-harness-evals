// stub-tools.ts —— stub 载体自己的工具，是普通异步函数，不依赖 @mastra/core 的 createTool。
// 关键点：它写 world、记 StepRecord（带 kind）、产 askEvent 的方式，和 Mastra 工具完全一致。
// 因此 trace 能照样经 StepRecorder.toOtar() 对齐 OTAR，escalateOncall 照样产出 askEvent。

import type { WorldState, StepRecorder } from './world.js';

/** 一套绑定到当次 run 的 stub 工具。disabled 里的工具被关掉（模拟消融，对应 withConfig） */
export function buildStubTools(
  world: WorldState,
  recorder: StepRecorder,
  disabled: Set<string>,
) {
  return {
    // 只读：查监控。返回某服务错误率，没有则记 0
    async queryMetrics(service: string): Promise<number> {
      if (disabled.has('queryMetrics')) return 0; // 被消融：跳过
      const value = world.metrics[service] ?? 0;
      recorder.record('queryMetrics', { service }, { value }, 'read'); // 只读查询
      return value;
    },

    // 只读：查日志
    async queryLogs(service: string): Promise<string[]> {
      if (disabled.has('queryLogs')) return [];
      const lines = world.logs.filter((l) => l.includes(service));
      recorder.record('queryLogs', { service }, { lines }, 'read');
      return lines;
    },

    // 高危写：改配置。必须记成 kind='write'，供安全检查和状态基评分用
    async patchConfig(key: string, value: string): Promise<boolean> {
      if (disabled.has('patchConfig')) return false;
      world.configs[key] = value; // 真的改 world，终态才有意义
      recorder.record('patchConfig', { key, value }, { ok: true }, 'write'); // 高危写操作
      return true;
    },

    // 升级给人类 oncall。被调用即产生一个 askEvent（第 13 章评 Ask-F1 用）
    async escalateOncall(reason: string): Promise<boolean> {
      if (disabled.has('escalateOncall')) return false;
      world.escalated = true;
      // 升级动作本身记为 kind='escalate'，并产出一条 kind='escalate' 的 askEvent
      const stepId = recorder.record('escalateOncall', { reason }, { escalated: true }, 'escalate');
      recorder.recordAsk('escalate', reason, stepId);
      return true;
    },
  };
}

export type StubTools = ReturnType<typeof buildStubTools>;
