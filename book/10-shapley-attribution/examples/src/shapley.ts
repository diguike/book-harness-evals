// Shapley 值的两种算法：枚举所有排列的精确值，和蒙特卡洛采样的近似值。
// 两者都基于同一个 coalition value 函数 phi(集合) → 整体分。

export type Phi = (coalition: Set<string>) => Promise<number>;

/** 生成数组的所有排列（N! 个）。N 小时才用，仅供精确算法。 */
function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items.slice();
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) {
      yield [items[i], ...p];
    }
  }
}

/**
 * 精确 Shapley 值：遍历所有加入顺序，累加每个模块加入时的边际贡献，求平均。
 * 复杂度 N! 次遍历，但 phi 带缓存后实际只会计算 2^N 个不同子集。
 * N ≤ 约 8 时可用；再大就退到蒙特卡洛。
 */
export async function exactShapley(modules: string[], phi: Phi): Promise<Record<string, number>> {
  const sum: Record<string, number> = Object.fromEntries(modules.map((m) => [m, 0]));
  let count = 0;

  for (const order of permutations(modules)) {
    const coalition = new Set<string>();
    let prev = await phi(coalition); // Φ(∅)
    for (const m of order) {
      coalition.add(m);
      const curr = await phi(coalition);
      sum[m] += curr - prev; // m 在"它之前已加入的集合"这个背景下的边际贡献
      prev = curr;
    }
    count++;
  }

  return Object.fromEntries(modules.map((m) => [m, sum[m] / count]));
}

/** Fisher–Yates 洗牌，返回一个新数组（不改原数组），可注入随机源以便复现 */
export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface MonteCarloResult {
  /** 各模块 Shapley 值的采样均值（无偏估计） */
  estimate: Record<string, number>;
  /** 各模块估计的标准误差，用来判定收敛 */
  stderr: Record<string, number>;
}

/**
 * 蒙特卡洛 Shapley：随机采样 samples 个加入顺序，在每个顺序上算各模块的边际贡献，
 * 求均值得无偏估计，并按边际贡献样本的方差算标准误差（收敛判据）。
 * @param rand 可注入的随机源，传固定种子的 PRNG 可让结果可复现。
 */
export async function monteCarloShapley(
  modules: string[],
  phi: Phi,
  samples: number,
  rand: () => number = Math.random,
): Promise<MonteCarloResult> {
  // 为每个模块累计边际贡献的和与平方和，最后算均值与方差
  const sum: Record<string, number> = Object.fromEntries(modules.map((m) => [m, 0]));
  const sumSq: Record<string, number> = Object.fromEntries(modules.map((m) => [m, 0]));

  for (let s = 0; s < samples; s++) {
    const order = shuffle(modules, rand);
    const coalition = new Set<string>();
    let prev = await phi(coalition);
    for (const m of order) {
      coalition.add(m);
      const curr = await phi(coalition);
      const marginal = curr - prev;
      sum[m] += marginal;
      sumSq[m] += marginal * marginal;
      prev = curr;
    }
  }

  const estimate: Record<string, number> = {};
  const stderr: Record<string, number> = {};
  for (const m of modules) {
    const mean = sum[m] / samples;
    estimate[m] = mean;
    // 样本方差 → 均值的标准误差 = sqrt(var / n)
    const variance = Math.max(0, sumSq[m] / samples - mean * mean);
    stderr[m] = Math.sqrt(variance / samples);
  }

  return { estimate, stderr };
}

/** 简单可复现 PRNG（mulberry32），让收敛曲线每次跑一致，便于核对 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
