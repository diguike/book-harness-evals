import { causalChain, type OtarNode } from './otar.js';
import { planIntervention, type CounterfactualResult, type Intervention } from './intervention.js';

/** 注入一次干预、重跑该任务、返回新终态。桩版与真 adapter 版各实现一个。 */
export type Rerun = (intv: Intervention) => Promise<'success' | 'fail'>;

export interface LocateResult {
  /** 候选病灶集（失败动作的因果链，去掉失败动作本身） */
  suspects: OtarNode[];
  /** 每个候选的干预裁决记录 */
  verdicts: CounterfactualResult[];
  /** 翻转点（翻转率过阈值） */
  flips: OtarNode[];
  /** 根因：翻转点里因果链最上游者；为 null 表示无单点翻转（可能多步耦合） */
  rootCause: OtarNode | null;
}

/**
 * 反事实根因定位（对应正文「最小复现」与流程图）。
 *
 * 1. 用第 8 章 causalChain 对失败动作回溯 → 候选病灶集（剪枝，只动因果链上的节点）；
 * 2. 对每个候选构造单点干预、注入重跑 repeats 次，统计翻转率；
 * 3. 翻转率过阈值的算翻转点；多个翻转点取因果链最上游者为根因（CHIEF 判据，前沿探索）。
 */
export async function locateRootCause(
  otar: OtarNode[],
  failingActionId: string,
  rerun: Rerun,
  opts: { repeats?: number; flipThreshold?: number } = {},
): Promise<LocateResult> {
  const repeats = opts.repeats ?? 5; // 每个干预重复跑几次，对抗模型抖动
  const flipThreshold = opts.flipThreshold ?? 0.6;

  const chain = causalChain(otar, failingActionId);
  // 失败动作本身不算病灶候选；result 节点由 action 派生，也跳过
  const suspects = chain.filter((n) => n.id !== failingActionId && n.kind !== 'result');

  const verdicts: CounterfactualResult[] = [];
  for (const node of suspects) {
    const intervention = planIntervention(node);
    let flippedTimes = 0;
    for (let i = 0; i < repeats; i++) {
      if ((await rerun(intervention)) === 'success') flippedTimes++;
    }
    const flipRate = flippedTimes / repeats;
    verdicts.push({
      node,
      intervention,
      flippedTimes,
      repeats,
      flipRate,
      isFlip: flipRate >= flipThreshold,
    });
  }

  const flips = verdicts.filter((v) => v.isFlip).map((v) => v.node);

  // chain 是拓扑序（上游在前），下标越小越上游
  const order = new Map(chain.map((n, i) => [n.id, i]));
  const rootCause =
    flips.length === 0
      ? null // 无单点翻转：可能是多步耦合失败，见正文「诚实边界」第三条
      : [...flips].sort((a, b) => order.get(a.id)! - order.get(b.id)!)[0];

  return { suspects, verdicts, flips, rootCause };
}
