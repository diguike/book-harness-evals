// harness-lab/src/mock-adapter.ts —— 不依赖外部模型 key 的适配器，用来端到端跑通整章。
// 它实现同一个 HarnessAdapter 接口：评测层读 RunResult 时分不出底层是真 agent 还是 mock。
//
// 第 7 章要并发回放一整个任务集。真模型每次跑要花钱、有方差，演示整体评测流水线时
// 用一段确定性脚本替代模型决策，跑出来稳定可复现；真实评测把它换成 MastraOncallAdapter 即可。

import type {
  HarnessAdapter,
  HarnessConfigPatch,
  EvalTask,
  ModuleHandle,
  RunResult,
} from './adapter.js';
import { createWorld, StepRecorder } from './world.js';
import { buildOncallTools } from './oncall-tools.js';
import { buildRunResult, type MastraAdapterConfig } from './mastra-adapter.js';

/**
 * MockOncallAdapter：用一段确定性脚本替代真模型的决策。
 * 脚本逻辑：从指令里解析目标服务 → 查监控 → 错误率超阈值就升级，否则查日志收尾。
 * threshold 故意做成可配置，第 7 章末尾会用它构造一个"次优变体"，演示整体分能区分两版 harness。
 */
export class MockOncallAdapter implements HarnessAdapter {
  name = 'mock-oncall';

  constructor(private config: MastraAdapterConfig & { threshold?: number }) {}

  async run(task: EvalTask, _opts?: { seed?: number }): Promise<RunResult> {
    const t0 = Date.now();
    const world = createWorld(task.initialState);
    const recorder = new StepRecorder();
    const tools = buildOncallTools(world, recorder);
    const disabled = this.config.disabled;
    const threshold = this.config.threshold ?? 0.05;
    const ctx = {} as never; // mock 不经过模型，execute 的第二个参数用不到

    const service = pickService(task.input, world.metrics, world.configs);

    if (service && !disabled.has('queryMetrics')) {
      const { value } = (await tools.queryMetrics.execute!({ service }, ctx)) as { value: number };

      if (value > threshold) {
        // 超阈值：升级给人（高危情况，必须人在回路）
        if (!disabled.has('escalateOncall')) {
          await tools.escalateOncall.execute!(
            { reason: `${service} 错误率 ${value} 超过阈值 ${threshold}` },
            ctx,
          );
        }
      } else if (!disabled.has('queryLogs')) {
        // 未超阈值：查一眼日志确认无误，不动配置（安全收尾）
        await tools.queryLogs.execute!({ service }, ctx);
      }
    }

    // 模拟 token 成本：每步算 ~120 token，让成本维度有非零信号
    const tokens = recorder.steps.length * 120;
    return buildRunResult(task.id, 'success', world, recorder, tokens, Date.now() - t0);
  }

  modules(): ModuleHandle[] {
    return [
      { id: 'queryMetrics', kind: 'tool' },
      { id: 'queryLogs', kind: 'tool' },
      { id: 'patchConfig', kind: 'tool' },
      { id: 'escalateOncall', kind: 'tool' },
      { id: 'instructions', kind: 'instruction' },
    ];
  }

  withConfig(patch: HarnessConfigPatch): HarnessAdapter {
    const disabled = new Set(this.config.disabled);
    for (const id of patch.disable ?? []) disabled.add(id);
    return new MockOncallAdapter({ ...this.config, disabled });
  }
}

/** 从指令里找一个出现在 metrics 或 configs 桩里的服务名 */
function pickService(
  input: string,
  metrics: Record<string, number>,
  configs: Record<string, string>,
): string | undefined {
  const candidates = new Set([...Object.keys(metrics), ...inferFromConfigs(configs)]);
  return [...candidates].find((s) => input.includes(s));
}

/** 配置 key 形如 "payment.timeout"，取点号前的服务段 */
function inferFromConfigs(configs: Record<string, string>): string[] {
  return Object.keys(configs).map((k) => k.split('.')[0]);
}
