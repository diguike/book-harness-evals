// backend-adapter.ts —— 服务端批处理适配器。封闭、可回放、无外部参与者。
// 和前端适配器接同一套工具 + 同一个 brain，区别只在：没有模拟用户，告警进来一把跑完。
// 这正是第 7 章并发回放能成立的形态：run() 一来一回，状态隔离，结果确定。

import type {
  HarnessAdapter,
  HarnessConfigPatch,
  EvalTask,
  ModuleHandle,
  RunResult,
} from './adapter.js';
import { createWorld, StepRecorder } from './world.js';
import { buildOncallTools } from './oncall-tools.js';
import { decideActions, defaultBrainConfig, type BrainConfig } from './oncall-brain.js';

export class BackendBatchAdapter implements HarnessAdapter {
  name = 'backend-batch';

  constructor(private cfg: BrainConfig = defaultBrainConfig()) {}

  async run(task: EvalTask): Promise<RunResult> {
    const t0 = Date.now();
    const world = createWorld(task.initialState);
    const recorder = new StepRecorder();
    const tools = buildOncallTools(world, recorder);
    const ctx = {} as never;

    // 服务端轨：没有人在回路实时确认，写操作走的是工作流批准（这里由 oracle 体现，
    // brain 在 confirmed=false 下对高危写一律改成升级，不自作主张）。
    const actions = decideActions(task.input, world, this.cfg, /* confirmed */ false);
    for (const a of actions) {
      const tool = (tools as Record<string, any>)[a.tool];
      if (tool) await tool.execute(a.args, ctx);
    }
    recorder.tokens = recorder.steps.length * 120;

    return recorder.toRunResult(task.id, world, Date.now() - t0);
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
    const disabled = new Set(this.cfg.disabled);
    for (const id of patch.disable ?? []) disabled.add(id);
    return new BackendBatchAdapter({ ...this.cfg, disabled });
  }
}
