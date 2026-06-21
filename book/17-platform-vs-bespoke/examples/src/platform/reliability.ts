// 平台层 · 第 12 章稳定性机制：pass^k 与 flakiness（与业务无关）
// 完整实现见第 12 章 examples/12-passk-flakiness/；这里给收口包的接口占位，
// 让第 17 章的 harness-lab 结构与正文包结构图逐行对得上。

/**
 * pass^k：k 次全部成功的概率（可靠性，悲观）。区别于 pass@k（至少一次成功）。
 * agent 评测看 pass^k——一次任务里有一步翻车就算失败。
 *
 * @param successes 单次成功率的样本里成功的次数
 * @param trials    总样本数
 * @param k         连续 k 次
 */
export function passHatK(successes: number, trials: number, k: number): number {
  // TODO（第 12 章完整实现）：用单次成功率 p 估计 p^k，并给出蒙特卡洛区间。
  if (trials === 0) return 0;
  const p = successes / trials;
  return p ** k;
}

/**
 * flakiness（抖动）：同输入多次跑结果不一致的程度，可靠性杀手。
 * @param outcomes 同一任务多次运行的成功/失败序列
 * @returns 0 表示完全稳定，1 表示一半成功一半失败（抖到极致）
 */
export function flakiness(outcomes: boolean[]): number {
  // TODO（第 12 章完整实现）：返回 2·p·(1-p) 之类的抖动度量。
  if (outcomes.length === 0) return 0;
  const p = outcomes.filter(Boolean).length / outcomes.length;
  return 2 * p * (1 - p);
}
