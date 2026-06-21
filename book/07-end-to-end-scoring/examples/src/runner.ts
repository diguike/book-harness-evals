// harness-lab/src/runner.ts —— 并发回放整个任务集。
// 关键约束：每个任务在隔离的 world 上跑（world.ts 已保证），所以可以放心并发。
// 但并发度不能无限大——真模型有 rate limit，机器有内存上限——用一个固定大小的 worker 池控住。

import type { EvalTask, HarnessAdapter, RunResult } from './adapter.js';

export interface RunnerOptions {
  concurrency?: number; // 同时在跑的任务数上限
  seed?: number; // 传给 adapter.run，配合固定温度做可复现对照（第 4 章）
}

/**
 * 并发跑完整个任务集，返回每个任务的 RunResult。
 * 用"固定数量 worker 抢同一个游标"的模式控制并发度，不一次性 Promise.all 全部任务。
 */
export async function runSuite(
  adapter: HarnessAdapter,
  tasks: EvalTask[],
  opts: RunnerOptions = {},
): Promise<RunResult[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const results: RunResult[] = new Array(tasks.length);
  let cursor = 0; // 下一个待领取的任务下标

  // 一个 worker：循环领任务、跑、写回对应槽位，直到任务被领光
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        results[i] = await adapter.run(tasks[i], { seed: opts.seed });
      } catch (err) {
        // 单个任务崩了不拖垮整批：记成 error 状态，照样进聚合
        results[i] = {
          taskId: tasks[i].id,
          status: 'error',
          finalState: {},
          steps: [],
          trace: [],
          askEvents: [],
          cost: { tokens: 0, ms: 0 },
        };
        console.error(`任务 ${tasks[i].id} 抛错:`, err);
      }
    }
  }

  // 起 concurrency 个 worker 一起抢任务
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
