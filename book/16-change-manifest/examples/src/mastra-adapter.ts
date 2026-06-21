// harness-lab/src/mastra-adapter.ts —— 把 Mastra 值班助手接进 HarnessAdapter 接口（第 5 章定义）。
// 全部 Mastra 细节都收口在这一个文件里，评测层永远看不到它的形状。

import { Agent } from '@mastra/core/agent';
import type {
  HarnessAdapter,
  HarnessConfigPatch,
  EvalTask,
  ModuleHandle,
  RunResult,
} from './adapter.js';
import { createWorld, StepRecorder, type WorldState } from './world.js';
import { buildOncallTools } from './oncall-tools.js';

export interface MastraAdapterConfig {
  disabled: Set<string>; // 被 withConfig 关掉的工具 id
  instructions: string; // agent 的系统提示词（属于 harness，可消融）
}

export class MastraOncallAdapter implements HarnessAdapter {
  name = 'mastra-oncall';

  constructor(private config: MastraAdapterConfig) {}

  async run(task: EvalTask, _opts?: { seed?: number }): Promise<RunResult> {
    const t0 = Date.now();

    // 1. 每次 run 一份隔离的 world，从任务初始态拷贝
    const world = createWorld(task.initialState);
    const recorder = new StepRecorder();

    // 2. 按当前 config 造工具，关掉 disabled 里的工具（withConfig 的消融能力）
    const allTools = buildOncallTools(world, recorder);
    const tools = Object.fromEntries(
      Object.entries(allTools).filter(([id]) => !this.config.disabled.has(id)),
    );

    // 3. 现造 agent。model 是唯一属于模型的部分，其余都是 harness 配置
    const agent = new Agent({
      id: 'oncall',
      name: 'oncall',
      instructions: this.config.instructions,
      model: 'openai/gpt-4.1', // 换成你实际在用的模型 id
      tools,
    });

    // 4. 跑。把 Mastra 的返回收口在这里，外面的评测层永远看不到它的形状
    let status: RunResult['status'] = 'success';
    let totalTokens = 0;
    try {
      const out = await agent.generate(task.input);
      totalTokens = out.usage?.totalTokens ?? 0;
    } catch {
      status = 'error';
    }

    return buildRunResult(task.id, status, world, recorder, totalTokens, Date.now() - t0);
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
    return new MastraOncallAdapter({ ...this.config, disabled });
  }
}

/** 把 recorder 和 world 里的数据组装成与框架无关的 RunResult（mock 适配器也复用它） */
export function buildRunResult(
  taskId: string,
  status: RunResult['status'],
  world: WorldState,
  recorder: StepRecorder,
  tokens: number,
  ms: number,
): RunResult {
  return {
    taskId,
    status,
    finalState: world, // 状态基评分的输入
    steps: recorder.steps,
    trace: recorder.toOtar(),
    askEvents: recorder.askEvents,
    cost: { tokens, ms },
  };
}
