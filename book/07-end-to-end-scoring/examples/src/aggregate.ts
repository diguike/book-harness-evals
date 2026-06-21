// harness-lab/src/aggregate.ts —— 把逐任务的评分聚合成"这套 harness 整体行不行"的几个数。
//
// 整体效果不是一个分，是一组维度（第 3 章）：正确率、安全率、成本。
// 每个比例型维度都带 Wilson CI，否则两版 harness 的分差可能落在噪声里（第 4 章）。
// 聚合刻意不把多维压成单一标量——压成一个数会把"安全出事"和"慢一点"混为一谈，
// 该一票否决的维度（安全）必须单独看。

import type { EvalTask, RunResult } from './adapter.js';
import type { StateScore } from './state-scorer.js';
import { wilsonInterval, type Interval } from './stats.js';

export type Tier = 'smoke' | 'core' | 'hard';

/** 单档的成绩：第 6 章把任务分了 smoke/core/hard，这里按档把正确率拆开看 */
export interface TierReport {
  n: number; // 该档任务数
  correctness: Interval; // 该档正确率 + CI
}

export interface SuiteReport {
  n: number; // 任务总数
  correctness: Interval; // 状态基通过率（带 CI）
  safety: Interval; // 安全率：没碰禁止写操作的比例（带 CI）
  byTier: Record<Tier, TierReport>; // 按难度档分层的正确率（兑现第 6 章"按档分层看"）
  cost: {
    totalTokens: number;
    avgTokens: number;
    avgMs: number;
    p95Ms: number; // 时延长尾，比平均更能反映线上体验
  };
  failures: StateScore[]; // 没通过的任务清单，给排错
}

/**
 * 把逐任务的状态分 + 原始 RunResult 聚合成整体报告。
 * 传入 tasks 是为了拿每题的 tier，按档分层——否则一个总分会把 smoke 的虚高和 hard 的退化抹平。
 */
export function aggregate(
  scores: StateScore[],
  results: RunResult[],
  tasks: EvalTask[],
): SuiteReport {
  const n = scores.length;
  const passed = scores.filter((s) => s.pass).length;
  const safe = scores.filter((s) => s.safe).length;

  const msArr = results.map((r) => r.cost.ms);
  const totalTokens = results.reduce((a, r) => a + r.cost.tokens, 0);

  return {
    n,
    correctness: wilsonInterval(passed, n),
    safety: wilsonInterval(safe, n),
    byTier: aggregateByTier(scores, tasks),
    cost: {
      totalTokens,
      avgTokens: n ? Math.round(totalTokens / n) : 0,
      avgMs: n ? Math.round(msArr.reduce((a, b) => a + b, 0) / n) : 0,
      p95Ms: percentile(msArr, 0.95),
    },
    failures: scores.filter((s) => !s.pass),
  };
}

/** 按 tier 把正确率拆开：没标 tier 的任务并进 core */
function aggregateByTier(scores: StateScore[], tasks: EvalTask[]): Record<Tier, TierReport> {
  const tierOf = new Map(tasks.map((t) => [t.id, t.tier ?? 'core']));
  const tiers: Tier[] = ['smoke', 'core', 'hard'];
  const out = {} as Record<Tier, TierReport>;
  for (const tier of tiers) {
    const inTier = scores.filter((s) => tierOf.get(s.taskId) === tier);
    out[tier] = { n: inTier.length, correctness: wilsonInterval(inTier.filter((s) => s.pass).length, inTier.length) };
  }
  return out;
}

/** 简单的分位数：排序后取对应位置，够演示用 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)]);
}
