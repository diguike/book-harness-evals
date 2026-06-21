// 污染判定：如果公开集得分显著高于保留集，且差距超过统计噪声，报疑似污染。
// "显著"接第 4 章的双比例显著性检验，不是拍脑袋。

import { twoProportionZTest } from './stats.js';

/** 一个集合的评分汇总：跑了 total 道，过了 passed 道 */
export interface SuiteScore {
  passed: number;
  total: number;
}

export interface ContaminationVerdict {
  publicRate: number;
  heldOutRate: number;
  diff: number; // 公开集 - 保留集
  pValue: number;
  contaminated: boolean; // 是否判定为疑似污染
  reason: string;
}

/**
 * 比对公开集与保留集得分，判定是否疑似污染。
 * 判定条件（两条同时满足才报警）：
 *   1) 公开集比保留集高出至少 minDiff（默认 0.05），方向必须是"公开集更高"；
 *   2) 这个差在统计上显著（p < alpha，默认 0.05），不是小样本噪声。
 */
export function judgeContamination(
  pub: SuiteScore,
  held: SuiteScore,
  opts: { minDiff?: number; alpha?: number } = {},
): ContaminationVerdict {
  const minDiff = opts.minDiff ?? 0.05;
  const alpha = opts.alpha ?? 0.05;

  const { z, pValue, diff } = twoProportionZTest(pub.passed, pub.total, held.passed, held.total);
  const publicRate = pub.passed / pub.total;
  const heldOutRate = held.passed / held.total;

  // 必须是"公开集更高"且差距够大且统计显著
  const contaminated = diff >= minDiff && pValue < alpha && z > 0;

  let reason: string;
  if (contaminated) {
    reason = `公开集(${publicRate.toFixed(3)}) 显著高于保留集(${heldOutRate.toFixed(3)})，差 ${diff.toFixed(3)}，p=${pValue.toFixed(4)} < ${alpha}：疑似污染，建议轮换保留集。`;
  } else if (diff >= minDiff) {
    reason = `公开集略高但不显著（p=${pValue.toFixed(4)} ≥ ${alpha}），差距落在噪声内，暂不报警。`;
  } else {
    reason = `差距未达显著性门槛（公开 ${publicRate.toFixed(3)} / 保留 ${heldOutRate.toFixed(3)}，diff=${diff.toFixed(3)}，p=${pValue.toFixed(4)} ≥ ${alpha}），落在统计噪声内，分数可信。`;
  }

  return { publicRate, heldOutRate, diff, pValue, contaminated, reason };
}
