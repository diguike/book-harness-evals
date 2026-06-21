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
