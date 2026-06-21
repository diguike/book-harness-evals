// 把任意 HarnessAdapter（第 5 章接口）的同一任务重复跑 n 次，收集 0/1 成功序列。
// 这是 pass^k / flakiness 估计的数据来源：评测单元从"一次运行"变成"n 次重复"。

import type { EvalTask, HarnessAdapter, RunResult } from './adapter.js';

export interface RepeatResult {
  taskId: string;
  outcomes: number[]; // 每次跑的 0/1 成功标记，长度 = n
  successes: number;
  total: number;
  runs: RunResult[]; // 原始结果，留着给抖动归因时看 trace
}

/** 判定一次运行是否成功：状态基比对终态（沿用第 7 章 oracle.expectedFinalState） */
export function isSuccess(result: RunResult, task: EvalTask): boolean {
  if (result.status === 'error') return false;
  const expected = task.oracle?.expectedFinalState;
  if (expected === undefined) return result.status === 'success';
  return JSON.stringify(result.finalState) === JSON.stringify(expected);
}

/**
 * 同一任务重复跑 n 次。注意每次都用同一个 initialState（在 adapter 内部新建 world，
 * 见各章 mock-adapter），抖动只能来自 harness 自身的非确定性，而非环境漂移。
 */
export async function repeatRun(
  adapter: HarnessAdapter,
  task: EvalTask,
  n: number,
): Promise<RepeatResult> {
  const runs: RunResult[] = [];
  const outcomes: number[] = [];
  for (let i = 0; i < n; i++) {
    // seed 每次不同，让 adapter 内可控随机源（如召回顺序）真正抖起来
    const result = await adapter.run(task, { seed: i });
    runs.push(result);
    outcomes.push(isSuccess(result, task) ? 1 : 0);
  }
  return {
    taskId: task.id,
    outcomes,
    successes: outcomes.reduce((a, b) => a + b, 0),
    total: n,
    runs,
  };
}
