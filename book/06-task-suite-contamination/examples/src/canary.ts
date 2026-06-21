// Canary string（金丝雀串）：在每道任务里埋一个几乎不可能自然出现的随机串。
// 它不影响任务执行，但给了一个探针——如果模型输出里吐出了它，
// 几乎可坐实任务集已进入模型训练数据。这是 BIG-bench 等基准的标准防污染做法。
// canary 不能阻止污染，它把"我怀疑被污染"变成"我有证据被污染"。

import { randomUUID } from 'node:crypto';
import type { EvalTask } from './types.js';

const CANARY_PREFIX = 'HARNESS-EVAL-CANARY';

/** 一道带 canary 的任务 */
export type TaskWithCanary = EvalTask & { canary: string };

/** 给一道任务生成并附上唯一 canary 串 */
export function withCanary(task: EvalTask): TaskWithCanary {
  return { ...task, canary: `${CANARY_PREFIX}-${randomUUID()}` };
}

/** 批量给任务集注入 canary */
export function injectCanaries(tasks: EvalTask[]): TaskWithCanary[] {
  return tasks.map(withCanary);
}

/**
 * 探针：扫一段模型输出，看有没有吐出任何已知 canary——吐出即坐实污染。
 * 返回命中的 canary 列表（空数组表示这段输出里没发现污染证据）。
 */
export function probeContamination(modelOutput: string, knownCanaries: string[]): string[] {
  return knownCanaries.filter((c) => modelOutput.includes(c));
}
