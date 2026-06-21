/**
 * src/non-additive.ts —— 复现“模块贡献不可加”
 *
 * 不用信论文的 pp 数字，自己用一个带交互项的玩具效用函数把它跑出来：
 * 单模块边际贡献 Δi 之和 ≠ 全模块在场时的整体增益，差的那块就是交互（冗余）项。
 * 这正是第 9 章不能拿 ΣΔi 当整体、第 10 章要用 Shapley 公平分账的根本理由。
 */

export const modules = ['memory', 'tools', 'middleware'] as const;
export type Mod = (typeof modules)[number];

// 单模块基础增益（pp）。数值取自调研报告里那组实测，便于对照
const base: Record<Mod, number> = { memory: 5.6, tools: 3.3, middleware: 2.2 };

// 每对同时在场模块的冗余惩罚（pp/对），交互效应的来源
const REDUNDANCY_PER_PAIR = 1.3;

/**
 * 效用函数：基础增益之和，再扣掉模块两两共存的冗余惩罚。
 * @param active 当前在场的模块集合
 * @returns 相对空 harness 的增益（pp）
 */
export function utility(active: Set<Mod>): number {
  let u = 0;
  for (const m of active) u += base[m];
  const present = modules.filter((m) => active.has(m));
  // 每对同时在场的模块能力部分重叠，整体不能简单叠加
  const pairs = (present.length * (present.length - 1)) / 2;
  return u - pairs * REDUNDANCY_PER_PAIR;
}

/**
 * 单模块单独贡献 Δi = Φ({i}) − Φ(∅)。
 * 这正是调研报告里“单独测内存 +5.6pp / 工具 +3.3pp / middleware +2.2pp”那组数的口径：
 * 一次只开一个模块，量它单独带来多少增益。把它们相加去预测整体，就会高估——差额即交互项。
 *
 * 注意口径：本函数使用的是单独上场口径 Φ({i}) − Φ(∅)，即研究报告里分别只开一个模块所测得的数值；
 * 第 9 章教的正式消融定义是 Φ(H) − Φ(H−i)（从完整 harness 拿掉模块 i 的损失）。
 * 两种口径在有交互效应时数值不同，但都能演示不可加性。
 */
export function ablationDelta(target: Mod): number {
  const alone = new Set<Mod>([target]);
  return utility(alone) - utility(new Set<Mod>());
}

export interface NonAdditiveReport {
  perModuleDelta: Record<Mod, number>;
  sumOfDeltas: number; // ΣΔi
  wholeGain: number; // 全模块在场的整体增益
  interactionGap: number; // ΣΔi − 整体增益，即被吞掉的交互项
}

/** 跑一遍“不可加”对照 */
export function runNonAdditive(): NonAdditiveReport {
  const perModuleDelta = {} as Record<Mod, number>;
  let sumOfDeltas = 0;
  for (const m of modules) {
    const d = ablationDelta(m);
    perModuleDelta[m] = d;
    sumOfDeltas += d;
  }
  const wholeGain = utility(new Set<Mod>(modules));
  return {
    perModuleDelta,
    sumOfDeltas,
    wholeGain,
    interactionGap: sumOfDeltas - wholeGain,
  };
}
