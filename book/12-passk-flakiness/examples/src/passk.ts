// 本章的稳定性统计工具箱：pass@k / pass^k / flakiness / bootstrap CI。
// 纯计算、无副作用。pass^k 是 agent 评测区别于模型评测的核心可靠性指标（τ-bench 范式）。

/** pass@k：k 次里至少一次成功的概率（能力上界，乐观）。假设各次独立、单次成功率为 p。 */
export function passAtK(p: number, k: number): number {
  return 1 - Math.pow(1 - p, k);
}

/** pass^k：k 次全部成功的概率（可靠性下界，悲观）。无人值守的 harness 看这个。 */
export function passHatK(p: number, k: number): number {
  return Math.pow(p, k);
}

/**
 * 从 n 次实跑结果（成功 c 次）无偏估计 pass^k：C(c,k) / C(n,k)。
 * 这是 HumanEval 估计 pass@k 那个无偏估计量的对偶，比"先估 p 再 p^k"在小 n、p 接近 1 时更稳。
 * 用比值连乘 ∏_{i=0..k-1} (c-i)/(n-i) 避免大数阶乘溢出。
 */
export function estimatePassHatK(successes: number, total: number, k: number): number {
  if (k > total) return NaN; // 跑的次数还不够 k 次，估不出来
  if (successes < k) return 0; // 成功数凑不出 k 个全成功的组合
  let ratio = 1;
  for (let i = 0; i < k; i++) {
    ratio *= (successes - i) / (total - i);
  }
  return ratio;
}

/**
 * flakiness 抖动率：4·p·(1-p)，归一到 [0,1]。
 * 0 表示完全确定（次次同样结果），1 表示像掷硬币一样最不可预测（p=0.5）。
 */
export function flakiness(successes: number, total: number): number {
  if (total === 0) return 0;
  const p = successes / total;
  return 4 * p * (1 - p);
}

/**
 * bootstrap 估 pass^k 的置信区间。
 * pass^k 是 n 次伯努利结果上的非线性组合统计量，不能直接套 Wilson（那是给比例本身用的）。
 * 做法：对 n 个 0/1 结果有放回重采样 B 次，每次重算 pass^k，取重采样分布的分位数。
 */
export function bootstrapPassHatKCI(
  outcomes: number[], // n 个 0/1 结果
  k: number,
  opts: { resamples?: number; alpha?: number; rng?: () => number } = {},
): { point: number; lower: number; upper: number } {
  const n = outcomes.length;
  const B = opts.resamples ?? 2000;
  const alpha = opts.alpha ?? 0.05;
  const rng = opts.rng ?? Math.random;
  const point = estimatePassHatK(sum(outcomes), n, k);

  const samples: number[] = [];
  for (let b = 0; b < B; b++) {
    let c = 0;
    for (let i = 0; i < n; i++) {
      // 有放回抽一个原始结果
      c += outcomes[Math.floor(rng() * n)];
    }
    const est = estimatePassHatK(c, n, k);
    if (!Number.isNaN(est)) samples.push(est);
  }
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor((alpha / 2) * samples.length)] ?? 0;
  const hi = samples[Math.min(samples.length - 1, Math.floor((1 - alpha / 2) * samples.length))] ?? 1;
  return { point, lower: lo, upper: hi };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
