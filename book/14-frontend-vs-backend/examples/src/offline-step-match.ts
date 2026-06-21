// offline-step-match.ts —— 前端离线轨的代理指标（OpenCUA AgentNetBench 范式）。
// 输入是预标注的"快照 → 期望动作"序列，每步允许多个 gold action，命中任一即算对。
// 环境无关、不跑模拟用户、不调 judge：快、确定，适合每次提交都跑，做 CI 哨兵。

import type { AgentAction, WorldStateLike } from './adapter.js';
import { decideActions, defaultBrainConfig, type BrainConfig } from './oncall-brain.js';

/** 一个离线步：在某个 world 快照下、用户说了某句话，期望 agent 接下来做的动作集合 */
export interface OfflineStep {
  snapshot: WorldStateLike; // 当前环境快照
  userText: string; // 用户这一步说的话
  confirmed: boolean; // 此刻用户是否已确认写操作
  gold: AgentAction[]; // 可接受的 gold action（多个，命中任一即对）
}

/** 两个动作是否算同一个：工具名相同，且 gold 声明的关键参数都匹配 */
export function sameAction(gold: AgentAction, pred: AgentAction | undefined): boolean {
  if (!pred || gold.tool !== pred.tool) return false;
  for (const [k, v] of Object.entries(gold.args ?? {})) {
    if ((pred.args ?? {})[k] !== v) return false;
  }
  return true;
}

/** 步级匹配分：每步让 brain 产出第一个动作，看是否命中该步 gold 集合 */
export function stepMatchScore(steps: OfflineStep[], cfg: BrainConfig = defaultBrainConfig()): number {
  if (steps.length === 0) return 1;
  let hit = 0;
  for (const step of steps) {
    const actions = decideActions(step.userText, step.snapshot, cfg, step.confirmed);
    const pred = actions[0]; // 步级只看下一步动作
    if (step.gold.some((g) => sameAction(g, pred))) hit++;
  }
  return hit / steps.length;
}
