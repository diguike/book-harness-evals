// 平台层 · 第 16 章变更门禁：change manifest 引擎 + 选回归（与业务无关）
// 完整实现见第 16 章 examples/16-change-manifest/；这里给收口包的接口占位。
// change manifest 是「前沿探索」（标注出处见附录 B），不当成熟定论。

import type { EvalTask } from './adapter.js';

/** 一次变更的声明：改了哪些模块、影响哪些任务标签（第 16 章 schema 的最小形状） */
export interface ChangeManifest {
  changedModules: string[]; // 这次动了哪些 harness 模块
  affectedTags?: string[]; // 声明可能受影响的任务标签
}

/**
 * 据 change manifest 选回归子集：只跑可能被这次变更影响的任务，
 * 而不是每次都全量回放（第 16 章核心）。
 */
export function selectRegression(
  _manifest: ChangeManifest,
  tasks: EvalTask[],
): EvalTask[] {
  // TODO（第 16 章完整实现）：按 manifest.affectedTags 与任务标签求交集选子集。
  return tasks;
}
