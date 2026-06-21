// harness-lab/src/stats.ts —— 报分必带误差棒。
// 整体分是个统计量：n 个任务里通过了 k 个，比例 k/n 只是点估计。
// 样本少的时候，真实通过率可能离这个点估计很远，必须给出区间。
// 二项比例的区间用 Wilson score interval——比朴素的 p±1.96·sqrt(p(1-p)/n) 在小样本、
// 接近 0 或 1 时都更稳（第 4 章详述，这里给可直接用的实现）。

export interface Interval {
  point: number; // 点估计 k/n
  low: number; // 区间下界
  high: number; // 区间上界
}

/**
 * Wilson score 区间。
 * @param successes 通过数 k
 * @param total 总数 n
 * @param z 置信水平对应的 z 值，1.96 ≈ 95%
 */
export function wilsonInterval(successes: number, total: number, z = 1.96): Interval {
  if (total === 0) return { point: 0, low: 0, high: 0 };
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denom;
  return {
    point: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

/** 把区间格式化成 "0.82 [0.69, 0.91]" 这样的字符串，方便打印 */
export function fmtInterval(iv: Interval): string {
  const f = (x: number) => x.toFixed(2);
  return `${f(iv.point)} [${f(iv.low)}, ${f(iv.high)}]`;
}

// ---- 以下是显著性检验，第 4 章定义，防劣化门禁（第 16 章）直接复用 ----

/**
 * 双比例 z 检验：判断新旧两版 harness 在某个任务子集上的通过率差异是不是噪声。
 * pValue 越小，越有把握说"它俩确实不一样"（习惯上 < 0.05 才下结论）。
 * 门禁要的就是这个：分涨了，但涨的是不是噪声？涨幅过不了显著性，就不算改进。
 */
export function twoProportionZTest(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number,
): { diff: number; z: number; pValue: number } {
  if (totalA === 0 || totalB === 0) return { diff: 0, z: 0, pValue: 1 };
  const pA = successA / totalA;
  const pB = successB / totalB;
  const pPool = (successA + successB) / (totalA + totalB); // 零假设下的合并比例
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / totalA + 1 / totalB));
  const z = se === 0 ? 0 : (pA - pB) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z))); // 双侧 p 值
  return { diff: pA - pB, z, pValue };
}

/**
 * Bonferroni 校正后的显著性门槛：一次门禁同时对 m 个任务子集做比较时，
 * 把 0.05 收紧到 0.05/m，避免"比的子集多了，至少撞上一个假阳性"。
 */
export function bonferroniThreshold(numComparisons: number, alpha = 0.05): number {
  return alpha / Math.max(1, numComparisons);
}

/** 标准正态分布 CDF 的数值近似（Abramowitz & Stegun 26.2.17）。 */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
