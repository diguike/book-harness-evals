// 平台层 · 第 7 章评分引擎 + 第 13 章 Ask-F1 聚合（与业务无关）
// 平台负责"怎么跑、怎么聚合"，业务通过钩子负责"什么算对、什么该升级"

import type { EvalTask, HarnessAdapter, RunResult } from './adapter.js';
import type { EscalationPolicy, SuccessPolicy } from './hooks.js';
import { wilsonInterval } from './stats.js';

// 平台默认成功口径：status 为 success 才算成功；超时/error 一律算失败。
// 对应正文的"默认统一"：业务想改口径，显式注入 SuccessPolicy 覆盖。
const defaultSuccessPolicy: SuccessPolicy = {
  isSuccess: (_task, result) => result.status === 'success',
};

export interface SuiteOptions {
  adapter: HarnessAdapter;
  tasks: EvalTask[];
  escalationPolicy: EscalationPolicy; // 业务钩子：该不该升级
  successPolicy?: SuccessPolicy; // 业务钩子（可选）：什么算成功
}

export interface SuiteReport {
  harness: string;
  total: number;
  passRate: { point: number; lower: number; upper: number }; // 带 Wilson CI
  askF1: { precision: number; recall: number; f1: number }; // 第 13 章
  costTokens: number;
}

/** 跑完整任务集：状态基评分 + Wilson CI + Ask-F1。平台引擎只认接口。 */
export async function runSuite(opts: SuiteOptions): Promise<SuiteReport> {
  const successPolicy = opts.successPolicy ?? defaultSuccessPolicy;

  let pass = 0;
  let tokens = 0;
  // Ask-F1 的混淆矩阵：tp=该升级且升级了，fp=不该升级却升级了，fn=该升级却没升
  let tp = 0;
  let fp = 0;
  let fn = 0;

  for (const task of opts.tasks) {
    const result: RunResult = await opts.adapter.run(task);
    tokens += result.cost.tokens;

    if (successPolicy.isSuccess(task, result)) pass += 1;

    // 业务策略判断"这次实际有没有升级"，oracle 给出"本该不该升级"
    const escalated = opts.escalationPolicy.shouldEscalate(task, result);
    const shouldHave = task.oracle?.mustEscalate ?? false;
    if (escalated && shouldHave) tp += 1;
    else if (escalated && !shouldHave) fp += 1;
    else if (!escalated && shouldHave) fn += 1;
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const ci = wilsonInterval(pass, opts.tasks.length);
  return {
    harness: opts.adapter.name,
    total: opts.tasks.length,
    passRate: { point: ci.point, lower: ci.lower, upper: ci.upper },
    askF1: { precision, recall, f1 },
    costTokens: tokens,
  };
}
