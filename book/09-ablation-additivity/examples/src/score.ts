// score.ts —— 状态基评分（第 7 章）：比对 run 的终态与 oracle，得到整体通过率 Φ。
// 本章的判定很简单：agent 实际是否升级（finalState.escalated）是否等于 oracle.mustEscalate。

import type { HarnessAdapter, EvalTask } from './adapter.js';
import { wilsonInterval, type Interval } from './wilson.js';

export interface SuiteScore {
  score: number; // 通过率 Φ = passed / total
  passed: number;
  total: number;
  ci: Interval; // 通过率的 Wilson 置信区间
}

/** 跑完整个任务集，按状态基评分聚合出整体分 Φ 与置信区间 */
export async function scoreSuite(adapter: HarnessAdapter, tasks: EvalTask[]): Promise<SuiteScore> {
  let passed = 0;
  // 并发跑（第 7 章的回放思路），这里任务量小直接 Promise.all
  const results = await Promise.all(tasks.map((t) => adapter.run(t)));
  for (let i = 0; i < tasks.length; i++) {
    const expected = tasks[i].oracle?.mustEscalate ?? false;
    const actual = (results[i].finalState as { escalated: boolean }).escalated;
    if (expected === actual) passed++;
  }
  const total = tasks.length;
  return { score: passed / total, passed, total, ci: wilsonInterval(passed, total) };
}
