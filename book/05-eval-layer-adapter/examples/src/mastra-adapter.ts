// harness-lab/src/mastra-adapter.ts —— 把 Mastra 值班助手接进 HarnessAdapter 接口。
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
      // totalUsage 是整次 run 跨所有步骤的累计；usage 只是最后一步。
      // 多轮工具调用时只取 usage 会系统性低估成本，优先用 totalUsage。
      totalTokens = out.totalUsage?.totalTokens ?? out.usage?.totalTokens ?? 0;
    } catch {
      // 框架升级改返回结构、模型调用失败，影响都被挡在这一个 catch 里
      status = 'error';
    }

    // 5. 组装成与框架无关的 RunResult
    return buildRunResult(task.id, status, world, recorder, totalTokens, Date.now() - t0);
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
    // 返回新实例，原实例不变：第 9 章消融时会并行持有多个变体，必须互不影响
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
    steps: recorder.steps, // 规整后的动作序列
    trace: recorder.toOtar(), // 最简 OTAR，第 8 章做成完整 DAG
    askEvents: recorder.askEvents,
    cost: { tokens, ms },
  };
}
