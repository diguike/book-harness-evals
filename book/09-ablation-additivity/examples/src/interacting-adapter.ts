// interacting-adapter.ts —— 一个模块之间“真有交互”的 mini 值班 harness 适配器。
//
// 它实现第 5 章的 HarnessAdapter 接口，但用一段确定性脚本代替模型决策，
// 这样消融结果完全可复现（不依赖外部模型 key）。三个可消融模块：
//   - queryMetrics（tool）：查错误率，是触发后续决策的入口。
//   - searchRunbook（tool）：查 runbook，给出“该不该升级”的先验。
//   - crossCheck（workflow/编排）：把 metrics 与 runbook 交叉比对再决策。
//
// 关键设计：searchRunbook 与 crossCheck 之间是“正交互”——
// runbook 给的先验，只有经过 crossCheck 才会真正影响决策。
// 单独留任何一个都用不上这个先验，两个一起在才生效。
// 这正是让单模块消融 Δi 不可加的根源。

import type {
  HarnessAdapter,
  HarnessConfigPatch,
  EvalTask,
  ModuleHandle,
  RunResult,
} from './adapter.js';
import { createWorld, StepRecorder, type WorldState } from './world.js';

const ALL_MODULES = ['queryMetrics', 'searchRunbook', 'crossCheck'] as const;

export class InteractingOncallAdapter implements HarnessAdapter {
  name = 'interacting-oncall';

  // disabled：被关掉的模块 id 集合。withConfig 往里加，run 时按它跳过对应模块。
  constructor(private readonly disabled: Set<string> = new Set()) {}

  async run(task: EvalTask, _opts?: { seed?: number }): Promise<RunResult> {
    const t0 = Date.now();
    const world = createWorld(task.initialState);
    const recorder = new StepRecorder();

    const hasMetrics = !this.disabled.has('queryMetrics');
    const hasRunbook = !this.disabled.has('searchRunbook');
    const hasCrossCheck = !this.disabled.has('crossCheck');

    const service = pickService(task.input, world);

    // —— 模块 1：queryMetrics。没有它，整个决策链就没有触发入口。
    let errorRate: number | undefined;
    if (service && hasMetrics) {
      errorRate = world.metrics[service];
      recorder.record('queryMetrics', { service }, { errorRate }, 'read');
    }

    // —— 模块 2：searchRunbook。拿到先验，但“拿到”不等于“用上”。
    let prior: 'should-escalate' | 'self-heal' | undefined;
    if (service && hasRunbook) {
      prior = world.runbook[service];
      recorder.record('searchRunbook', { service }, { prior }, 'read');
    }

    // —— 决策：到底要不要升级。
    let decideEscalate = false;
    if (errorRate !== undefined) {
      // 基线启发式：错误率超阈值就升级。它对一批“边界”任务会判错。
      const metricSaysEscalate = errorRate > 0.05;

      if (hasCrossCheck && prior !== undefined) {
        // crossCheck × searchRunbook 的交互在这里发生：
        // 只有 crossCheck 在、且 runbook 先验拿到了，先验才会覆盖启发式。
        decideEscalate = prior === 'should-escalate';
        recorder.record(
          'crossCheck',
          { metricSaysEscalate, prior },
          { decision: decideEscalate, basis: 'runbook-prior' },
          'thought',
        );
      } else {
        // 缺 crossCheck 或缺 runbook：退化成只看 metrics 的启发式。
        decideEscalate = metricSaysEscalate;
        if (hasCrossCheck) {
          // crossCheck 在、但 runbook 不在：它无 prior 可比对，只能透传启发式。
          recorder.record(
            'crossCheck',
            { metricSaysEscalate, prior },
            { decision: decideEscalate, basis: 'metric-only' },
            'thought',
          );
        }
      }
    }

    if (decideEscalate) {
      world.escalated = true;
      recorder.record('escalateOncall', { service }, { ok: true }, 'escalate');
      recorder.recordAsk(`${service} 需要升级给人类 oncall`);
    }

    return buildRunResult(task.id, world, recorder, Date.now() - t0);
  }

  modules(): ModuleHandle[] {
    return [
      { id: 'queryMetrics', kind: 'tool' },
      { id: 'searchRunbook', kind: 'tool' },
      { id: 'crossCheck', kind: 'workflow' },
    ];
  }

  withConfig(patch: HarnessConfigPatch): HarnessAdapter {
    const next = new Set(this.disabled);
    for (const id of patch.disable ?? []) next.add(id);
    return new InteractingOncallAdapter(next);
  }
}

/** 全模块 id 清单，给消融脚本枚举用 */
export const moduleIds = [...ALL_MODULES];

/** 从任务指令里找一个出现在 metrics 桩里的服务名 */
function pickService(input: string, world: WorldState): string | undefined {
  return Object.keys(world.metrics).find((s) => input.includes(s));
}

/** 把一次 run 的世界终态与留痕规整成 RunResult */
function buildRunResult(
  taskId: string,
  world: WorldState,
  recorder: StepRecorder,
  ms: number,
): RunResult {
  return {
    taskId,
    status: 'success',
    finalState: { escalated: world.escalated },
    steps: recorder.steps,
    trace: recorder.toOtar(),
    askEvents: recorder.askEvents,
    cost: { tokens: 0, ms },
  };
}
