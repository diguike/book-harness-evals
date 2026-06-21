// wilson.ts —— 二项比例的 Wilson 置信区间（第 4 章 wilsonInterval 的本章副本）。
// 评测分是统计量，Δi 是两个统计量相减，下手砍模块前要看它的误差棒有没有跨过零。

export interface Interval {
  point: number; // 点估计：successes / n
  low: number;
  high: number;
}

/**
 * 计算 n 次试验中 successes 次成功的 Wilson 置信区间。
 * @param z 标准正态分位数，默认 1.96 对应 95% 置信。
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  if (n === 0) return { point: 0, low: 0, high: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    point: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

/** 把一个区间格式化成 “0.800 [0.612, 0.910]” 这样的字符串，方便打印 */
export function fmtInterval(iv: Interval): string {
  return `${iv.point.toFixed(3)} [${iv.low.toFixed(3)}, ${iv.high.toFixed(3)}]`;
}
