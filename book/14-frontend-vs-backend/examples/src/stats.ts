// stats.ts —— Wilson 区间（第 4 章）。比例型评测分必须带误差棒，少量样本用 Wilson 而非正态近似。

export interface Interval {
  point: number;
  low: number;
  high: number;
}

/** 二项比例的 Wilson score 区间，z 默认取 1.96（95%） */
export function wilson(successes: number, n: number, z = 1.96): Interval {
  if (n === 0) return { point: 0, low: 0, high: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { point: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

export function fmt(x: number): string {
  return x.toFixed(3);
}
