// coalition value Φ(S)：只装了模块集合 S 时，这套 harness 的整体效果分。
//
// 真实评测里 Φ(S) = 用 adapter.withConfig({ disable: 全集−S }) 构造变体 → 第 7 章并发回放
// 整个任务集 → 状态基评分 → 聚合成一个 0–1 的整体分（见文件末尾 makeRealPhi 的接法）。
// 那条路要花钱、有方差、跑得慢。本文件用一段**确定性桩**复刻同一个 Φ(S) 接口，
// 内含可控的"冗余 / 互补"关系，让精确 Shapley、蒙特卡洛近似、单消融 Δ 三者的对照可复现，
// 不依赖任何模型 key 就能跑通整章。

/** 五个模块，与第 7 章值班助手的部件对齐 */
export const MODULES = [
  'queryMetrics', // 查监控（较独立）
  'queryLogs', // 查日志（独立，不进任何冗余/互补对，基础增益较低）
  'searchRunbook', // 查值班手册（与 reflection 冗余）
  'instructions', // 约束高危写的指令（与 reflection 互补）
  'reflection', // 动手前先复述改动（与手册冗余、与 instructions 互补）
] as const;

export type ModuleId = (typeof MODULES)[number];

// 每个模块的"独立基础增益"：互不影响时，加上它能给整体分带来多少。
const BASE_GAIN: Record<ModuleId, number> = {
  queryMetrics: 0.06,
  queryLogs: 0.02,
  searchRunbook: 0.06,
  instructions: 0.03,
  reflection: 0.06,
};

// 成对交互项：当某两个模块同时在场时，对整体分的额外调整。
// 负数 = 冗余（功能重叠，第二个补上去收益打折）；正数 = 互补（一起装收益更大）。
const PAIR_INTERACTION: Array<[ModuleId, ModuleId, number]> = [
  ['searchRunbook', 'reflection', -0.04], // 手册与复述都在防错，功能冗余
  ['instructions', 'reflection', +0.02], // 指令划线、复述执行，互补
];

// 空集基线 Φ(∅)：什么模块都不装时的整体分（只有最朴素的 agent）。
export const BASELINE = 0.5;

/**
 * 确定性 coalition value：Φ(S) = 基线 + Σ在场模块的基础增益 + Σ在场成对交互。
 * 设计成纯函数 + 加性主项 + 显式交互项，于是：
 *   - Φ(全集) − Φ(∅) 恰好 = Σ基础增益 + Σ交互项，可手算核对；
 *   - 冗余对让对应模块的 Shapley 值低于其单消融 Δ；
 *   - 互补对让对应模块的 Shapley 值高于其单消融 Δ。
 */
export function phiSync(coalition: Set<string>): number {
  let v = BASELINE;
  for (const m of MODULES) {
    if (coalition.has(m)) v += BASE_GAIN[m];
  }
  for (const [a, b, delta] of PAIR_INTERACTION) {
    if (coalition.has(a) && coalition.has(b)) v += delta;
  }
  return v;
}

/**
 * 带缓存的异步 Φ(S)，签名与真实评测一致（Φ 要并发回放，天然是异步）。
 * 缓存是关键工程点：同一个子集 S 在不同排列里会反复出现，
 * Φ(S) 算过一次就缓存，蒙特卡洛才真省得下评分开销。
 * 返回的 calls 计数器用来演示缓存命中的效果。
 */
export function makeCachedPhi(): {
  phi: (coalition: Set<string>) => Promise<number>;
  stats: { calls: number; computed: number };
} {
  const cache = new Map<string, number>();
  const stats = { calls: 0, computed: 0 };

  const phi = async (coalition: Set<string>): Promise<number> => {
    stats.calls++;
    const key = [...coalition].sort().join(','); // 子集的规范化 key，与顺序无关
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    stats.computed++;
    const v = phiSync(coalition); // 真实场景这里换成"并发回放 + 状态基评分"
    cache.set(key, v);
    return v;
  };

  return { phi, stats };
}

// ── 真实接法（不在本示例默认执行路径里，仅示范怎么把桩换成第 7 章的 Φ）──
//
// import type { HarnessAdapter, EvalTask } from './adapter.js';
// import { scoreSuite } from '../../07-end-to-end-scoring/examples/src/aggregate.js';
//
// export function makeRealPhi(adapter: HarnessAdapter, suite: EvalTask[]) {
//   const cache = new Map<string, number>();
//   return async (coalition: Set<string>): Promise<number> => {
//     const key = [...coalition].sort().join(',');
//     const hit = cache.get(key);
//     if (hit !== undefined) return hit;
//     // 关掉不在 coalition 里的模块，构造只装 S 的变体
//     const disable = MODULES.filter((m) => !coalition.has(m));
//     const variant = adapter.withConfig({ disable });
//     // 并发回放整个任务集 + 状态基评分 + 聚合，取整体分点估计
//     const score = await scoreSuite(variant, suite); // 第 7 章流水线
//     cache.set(key, score.point);
//     return score.point;
//   };
// }
