// harness-lab/src/manifest.ts —— change manifest schema 与据它选回归子集（第 16 章核心）。
//
// change manifest 是每次改 harness 时跟着改动一起提交的一份声明，回答两件事：
//   1. 这次改了哪些模块（changedModules）——决定要重点回归哪些任务；
//   2. 期望发生什么（predictions）——每条是一个可证伪的预测，下一轮评测用实际 delta 来裁决。
//
// 前沿来源：把"每次改动附一个可证伪预测、下轮评测求交裁决"作为数据反哺闭环，
// 出自 2026 年 change manifest 相关 preprint（见附录 B），作者自报、尚未被独立大规模复现。
// 本文件是按这个思路做的一版最小实现，不是论文原物。

import { z } from 'zod';

/** 一条可证伪预测：声称对某个任务集合的通过率会朝某个方向变 */
export const PredictionSchema = z.object({
  // 这条预测针对哪些任务（任务 id 列表）。留空表示"针对所有被改动模块碰到的任务"
  tasks: z.array(z.string()).default([]),
  // 期望方向：fix=应该变好，keep=应该不动（守住），这两类都要兑现才算改对了
  expect: z.enum(['fix', 'keep']),
  // 人读的理由，方便复盘对照"当初是怎么想的"
  rationale: z.string(),
});
export type Prediction = z.infer<typeof PredictionSchema>;

/** change manifest：跟一次 harness 改动一起提交的声明 */
export const ChangeManifestSchema = z.object({
  id: z.string(), // 这次改动的标识，通常用 commit/PR 号
  // 改了哪些 harness 模块（工具 id / 'instructions' / workflow 名…），驱动选择性回归
  changedModules: z.array(z.string()).min(1),
  predictions: z.array(PredictionSchema).default([]),
});
export type ChangeManifest = z.infer<typeof ChangeManifestSchema>;

/** 选回归子集的结果：哪些任务必须跑，以及为什么 */
export interface RegressionPlan {
  selected: string[]; // 要回归的任务 id
  reason: string;
}

/**
 * 据 manifest 选回归子集：改了哪些模块，就回归所有"碰到这些模块"的任务（touches 求交）。
 * 这就是选择性回归——不必每次全量跑，只跑可能被这次改动影响到的那一片，省时间又不漏。
 *
 * 关键安全垫：predictions 里点名的任务，哪怕它的 touches 没和 changedModules 撞上，也强制纳入。
 * 道理是——你既然敢预测它会变，就得真的跑它来验你的预测。
 */
export function selectRegression(
  manifest: ChangeManifest,
  tasks: { id: string; touches: string[] }[],
): RegressionPlan {
  const changed = new Set(manifest.changedModules);
  const byTouch = tasks
    .filter((t) => t.touches.some((m) => changed.has(m)))
    .map((t) => t.id);

  const byPrediction = manifest.predictions.flatMap((p) => p.tasks);
  const selected = [...new Set([...byTouch, ...byPrediction])];

  return {
    selected,
    reason:
      `改动模块 [${manifest.changedModules.join(', ')}] 命中 ${byTouch.length} 条任务，` +
      `预测显式点名追加 ${new Set(byPrediction).size} 条，去重后回归 ${selected.length} 条`,
  };
}
