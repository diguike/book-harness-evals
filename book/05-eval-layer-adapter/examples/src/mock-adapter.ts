// harness-lab/src/mock-adapter.ts —— 不依赖外部模型 key 的适配器，用来先验证骨架。
// 它实现同一个 HarnessAdapter 接口：评测层代码读 RunResult 时，分不出底层是真 agent 还是 mock。
// 这正是解耦的验收标准——评测代码里看不出用的是哪个框架。

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
 * 脚本逻辑刻意写得很简单：查监控 → 错误率超阈值就升级，否则不动。
 * 真实评测里把它换成 MastraOncallAdapter 即可，接口完全一致。
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

    // 从任务输入里粗略解析出目标服务名（mock 不调用模型，用关键词匹配代替）
    const service = pickService(task.input, world.metrics);

    // 决策脚本：查监控 → 超阈值升级。每一步若工具被 disabled 则跳过（模拟消融）
    if (service && !disabled.has('queryMetrics')) {
      // Mastra v1：execute(input, context)，这里直接调用工具、不经过模型。
      // 第二个参数是执行元数据，mock 场景用不到，传空对象即可。
      const ctx = {} as never;
      const { value } = (await tools.queryMetrics.execute!({ service }, ctx)) as {
        value: number;
      };
      if (value > threshold && !disabled.has('escalateOncall')) {
        await tools.escalateOncall.execute!(
          { reason: `${service} 错误率 ${value} 超过阈值 ${threshold}` },
          ctx,
        );
      }
    }

    return buildRunResult(task.id, 'success', world, recorder, 0, Date.now() - t0);
  }

  modules(): ModuleHandle[] {
    return [
      { id: 'queryMetrics', kind: 'tool' },
      { id: 'queryLogs', kind: 'tool' },
      { id: 'searchRunbook', kind: 'tool' },
      { id: 'patchConfig', kind: 'tool' },
      { id: 'restartService', kind: 'tool' },
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

/** 从指令里找一个出现在 metrics 桩里的服务名 */
function pickService(input: string, metrics: Record<string, number>): string | undefined {
  return Object.keys(metrics).find((s) => input.includes(s));
}
