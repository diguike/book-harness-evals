// 本章的统计工具箱：把评测分当随机变量处理所需的几个函数。
// 这些函数纯计算、无副作用，后续 7/12/15/16 章都会复用同样的形状。

/**
 * Wilson score 区间：给"n 次里成功 x 次"的二项比例配置信区间。
 * 比教科书的 Wald 近似 (p ± z·√(p(1-p)/n)) 在小样本/极端比例下稳得多，
 * 是 Evan Miller《Adding Error Bars to Evals》推荐评测场景默认使用的区间。
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z = 1.96, // 95% 置信水平对应的正态分位数
): { lower: number; upper: number; point: number } {
  if (total === 0) return { lower: 0, upper: 1, point: 0 };
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return { lower: center - margin, upper: center + margin, point: p };
}

/**
 * 估算两组比例对比、想检测出 delta 大小提升时，每组大致需要多少样本。
 * 双侧 95% 置信（alpha=0.05）、80% 把握度（power=0.8）下的常用近似。
 * 用来在动手跑评测前就回答："我这点样本量，配下多大的结论？"
 */
export function sampleSizePerGroup(baseline: number, delta: number): number {
  const zAlpha = 1.96; // 双侧 alpha=0.05
  const zBeta = 0.84; // power=0.8
  const p1 = baseline;
  const p2 = baseline + delta;
  const pBar = (p1 + p2) / 2;
  const numerator =
    zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
    zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((numerator * numerator) / (delta * delta));
}

/**
 * 双比例 z 检验：判断 A、B 两版 harness 的通过率差异是不是噪声。
 * 返回的 pValue 越小，越有把握说"它俩确实不一样"（习惯上 < 0.05 才下结论）。
 */
export function twoProportionZTest(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number,
): { diff: number; z: number; pValue: number } {
  const pA = successA / totalA;
  const pB = successB / totalB;
  const pPool = (successA + successB) / (totalA + totalB); // 零假设下的合并比例
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / totalA + 1 / totalB));
  const z = se === 0 ? 0 : (pA - pB) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z))); // 双侧 p 值
  return { diff: pA - pB, z, pValue };
}

/**
 * Bonferroni 校正后的显著性门槛：同时做 m 次比较时，把 0.05 收紧到 0.05/m，
 * 避免"比的东西多了，至少撞上一个假阳性"。
 */
export function bonferroniThreshold(numComparisons: number, alpha = 0.05): number {
  return alpha / Math.max(1, numComparisons);
}

/** 标准正态分布 CDF 的数值近似（Abramowitz & Stegun 26.2.17）。 */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
