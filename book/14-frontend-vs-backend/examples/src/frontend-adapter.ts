// frontend-adapter.ts —— 前端面板适配器。
// 关键点：把整轮"模拟用户 ↔ agent"对话塞进 run() 内部，外部仍是标准的 run() → RunResult，
// 评测层分不出底层是封闭批跑还是多轮交互——这正是 adapter 解耦的价值。

import type {
  HarnessAdapter,
  HarnessConfigPatch,
  EvalTask,
  FrontendEvalTask,
  ModuleHandle,
  RunResult,
  UserPersona,
} from './adapter.js';
import { createWorld, StepRecorder } from './world.js';
import { buildOncallTools } from './oncall-tools.js';
import { decideActions, brainReply, defaultBrainConfig, type BrainConfig } from './oncall-brain.js';
import {
  MockUserSimulator,
  buildRealUserSimulator,
  type UserSimulator,
} from './user-simulator.js';

const MAX_TURNS = 8;

export class FrontendPanelAdapter implements HarnessAdapter {
  name = 'frontend-panel';

  constructor(private cfg: BrainConfig = defaultBrainConfig()) {}

  // 接口签名沿用公共 EvalTask；前端轨实际传入的是 FrontendEvalTask（带 persona）。
  async run(task: EvalTask): Promise<RunResult> {
    const t0 = Date.now();
    const world = createWorld(task.initialState);
    const recorder = new StepRecorder();
    const tools = buildOncallTools(world, recorder);
    const ctx = {} as never; // execute 第二个参数（runtimeContext）在桩环境用不到

    // 前端任务必带 persona；万一拿到的是裸 EvalTask，用 input 兜底成一个最小画像
    const persona: UserPersona =
      (task as FrontendEvalTask).persona ?? { goal: task.input, style: '简短' };
    const user = await makeSimulator(persona);

    let confirmed = false; // agent 是否已得到用户对写操作的明确确认
    let userSays = await user.firstTurn(task.input);
    recorder.say('user', userSays);

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (userSays.trim() === 'DONE') break;
      if (/确认，按我说的改/.test(userSays)) confirmed = true;

      // agent 侧：决定动作 → 执行 → 给出自然语言回复
      const actions = decideActions(userSays, world, this.cfg, confirmed);
      for (const a of actions) {
        const tool = (tools as Record<string, any>)[a.tool];
        if (tool) await tool.execute(a.args, ctx);
      }
      const reply = brainReply(actions, world);
      recorder.say('agent', reply);
      recorder.tokens += 150; // 每轮粗略计一笔 token 成本

      userSays = await user.nextTurn(reply);
      recorder.say('user', userSays);
    }

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
    return new FrontendPanelAdapter({ ...this.cfg, disabled });
  }
}

/** 默认确定性 mock 模拟用户；USE_REAL_MODEL=1 时换成真 Mastra Agent */
async function makeSimulator(persona: UserPersona): Promise<UserSimulator> {
  if (process.env.USE_REAL_MODEL === '1') return buildRealUserSimulator(persona);
  return new MockUserSimulator(persona);
}
