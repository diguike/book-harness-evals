// 公开集 / 私有保留集切分。
// 公开集可以写进文档、做演示，接受它早晚被污染；
// 保留集绝不出仓库，门禁与对外汇报以它的分为准。
// 用任务 id 的稳定哈希决定每道题归哪一集——同一道题永远落在同一边，可复现。

import type { EvalTask } from './types.js';

/** FNV-1a 字符串哈希：稳定、与平台无关，不依赖随机数 */
export function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface SplitResult {
  publicSet: EvalTask[]; // 对外可见，可写文档/演示
  heldOut: EvalTask[]; // 私有保留集，门禁以此为准
}

/**
 * 把任务集切成公开集和保留集。
 * @param heldOutRatio 保留集占比，默认 0.3
 */
export function splitSuite(tasks: EvalTask[], heldOutRatio = 0.3): SplitResult {
  const publicSet: EvalTask[] = [];
  const heldOut: EvalTask[] = [];
  const threshold = heldOutRatio * 100;
  for (const t of tasks) {
    const bucket = stableHash(t.id) % 100;
    if (bucket < threshold) heldOut.push(t);
    else publicSet.push(t);
  }
  return { publicSet, heldOut };
}
