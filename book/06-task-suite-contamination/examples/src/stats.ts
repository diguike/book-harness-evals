// 从第 4 章搬来的双比例显著性检验，本章污染判定要用它。
// 把"公开集得分高于保留集"区分成"真的显著"还是"落在噪声里"。
// 第 4 章 examples/04-eval-as-experiment/src/stats.ts 是同一实现。

/**
 * 双比例 z 检验：检验两组成功率 p1、p2 是否有显著差异。
 * 返回 z 值和双侧 p 值。p 值越小，越说明差异不是噪声。
 */
export function twoProportionZTest(
  x1: number,
  n1: number,
  x2: number,
  n2: number,
): { z: number; pValue: number; diff: number } {
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pPool = (x1 + x2) / (n1 + n2); // 合并比例（原假设：两组同分布）
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, pValue: 1, diff: p1 - p2 };
  const z = (p1 - p2) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z))); // 双侧
  return { z, pValue, diff: p1 - p2 };
}

/** 标准正态累积分布函数（用误差函数近似） */
function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** 误差函数 erf 的 Abramowitz-Stegun 数值近似 */
function erf(x: number): number {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}
