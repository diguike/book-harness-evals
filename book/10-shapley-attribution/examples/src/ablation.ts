// 第 9 章的单模块消融 Δ：从满配出发，逐个关掉模块，看整体分掉多少。
// 放在这里是为了和 Shapley 做对照——Δᵢ 测的是"其余模块全在场"这一个背景下的边际贡献。

import type { Phi } from './shapley.js';

/**
 * 对每个模块算单消融贡献 Δᵢ = Φ(全集) − Φ(全集 − i)。
 * 各 Δᵢ 不可加：对冗余模块低估、对互补模块高估（双重记功），ΣΔ ≠ Φ(全集) − Φ(∅)。
 */
export async function ablationDeltas(
  modules: string[],
  phi: Phi,
): Promise<Record<string, number>> {
  const full = new Set(modules);
  const vFull = await phi(full);

  const deltas: Record<string, number> = {};
  for (const m of modules) {
    const minusM = new Set(full);
    minusM.delete(m);
    deltas[m] = vFull - (await phi(minusM));
  }
  return deltas;
}
