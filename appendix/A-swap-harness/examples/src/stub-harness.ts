// stub-harness.ts —— 一个完全不依赖 Mastra 的 harness 适配器。
// 它用一段裸 TypeScript 编排冒充"另一个 harness 框架"，对外实现与第 5 章 Mastra adapter
// 一模一样的 HarnessAdapter 接口，跑本书同一套任务集、产出同一形状的 RunResult。
// 验收标准：评测层代码一行不改就能评它（见 verify-swap.ts）。

import type {
  HarnessAdapter,
  HarnessConfigPatch,
  EvalTask,
  ModuleHandle,
  RunResult,
} from './adapter.js';
import { createWorld, StepRecorder, type WorldState } from './world.js';
import { buildStubTools, type StubTools } from './stub-tools.js';

export interface StubConfig {
  disabled: Set<string>; // 被 withConfig 关掉的模块 id
  threshold: number; // 错误率超过它就升级
}

export class StubOncallHarness implements HarnessAdapter {
  name = 'stub-oncall'; // 报表里和 mastra-oncall 区分开

  constructor(private config: StubConfig) {}

  // stub 是确定性脚本，同一输入必产同一结果，不需要 seed，故省掉可选的 opts 参数
  async run(task: EvalTask): Promise<RunResult> {
    const t0 = Date.now();

    // 1. 每次 run 一份隔离 world：和 Mastra adapter 用的是同一个 world 模块
    const world = createWorld(task.initialState);
    const recorder = new StepRecorder();

    // 2. 现造工具，关掉 disabled 里的（withConfig 的消融能力体现在工具层）
    const tools = buildStubTools(world, recorder, this.config.disabled);

    // 3. 驱动底层 harness。这里是裸 TS 脚本，没有模型、没有框架——
    //    换载体时，唯一要改的就是这一处"怎么驱动 harness"。
    let status: RunResult['status'] = 'success';
    try {
      await runOncallScript(task.input, tools, world, this.config.threshold);
    } catch {
      status = 'error'; // 脚本/框架异常都兜在这里，不让评测层崩
    }

    // 4. 组装与框架无关的 RunResult，七个字段齐全
    return {
      taskId: task.id,
      status,
      finalState: world, // 状态基评分（第 7 章）
      steps: recorder.steps, // 轨迹
      trace: recorder.toOtar(), // 对齐 OTAR（第 8 章）
      askEvents: recorder.askEvents, // Ask-F1（第 13 章）
      cost: { tokens: 0, ms: Date.now() - t0 }, // stub 不烧 token
    };
  }

  modules(): ModuleHandle[] {
    // 与 Mastra adapter 返回同一套 id：归因/消融脚本无需感知载体差异
    return [
      { id: 'queryMetrics', kind: 'tool' },
      { id: 'queryLogs', kind: 'tool' },
      { id: 'patchConfig', kind: 'tool' },
      { id: 'escalateOncall', kind: 'tool' },
      { id: 'instructions', kind: 'instruction' },
    ];
  }

  withConfig(patch: HarnessConfigPatch): HarnessAdapter {
    // 返回新实例，绝不原地改 this（第 9 章并行持有多变体的前提）
    const disabled = new Set(this.config.disabled);
    for (const id of patch.disable ?? []) disabled.add(id);
    // replace 在 stub 里暂未实现（stub 的模块就是几个裸函数，不需要替换实现）；
    // 迁到真实框架时，在此处理 patch.replace（用替身工具/记忆/提示词换掉原模块）。
    return new StubOncallHarness({ ...this.config, disabled });
  }
}

/**
 * 底层 harness 的决策脚本：查监控 → 错误率超阈值就先查日志再升级，否则不动。
 * 刻意写得很简单，因为附录演示的是 adapter 的形状，不是 agent 的智能。
 * 真实迁移时，这里换成 LangGraph 图执行 / OpenAI Agents SDK / 内部引擎的调用。
 */
async function runOncallScript(
  input: string,
  tools: StubTools,
  world: WorldState,
  threshold: number,
): Promise<void> {
  // 从指令里粗略解析目标服务名（stub 不调模型，用关键词匹配代替）
  const service = pickService(input, world.metrics);
  if (!service) return;

  const errorRate = await tools.queryMetrics(service);
  if (errorRate > threshold) {
    // 超阈值：先看日志佐证，再升级给人，绝不自作主张改配置
    await tools.queryLogs(service);
    await tools.escalateOncall(`${service} 错误率 ${errorRate} 超过阈值 ${threshold}`);
  }
}

/** 从指令里找一个出现在 metrics 桩里的服务名 */
function pickService(input: string, metrics: Record<string, number>): string | undefined {
  return Object.keys(metrics).find((s) => input.includes(s));
}
