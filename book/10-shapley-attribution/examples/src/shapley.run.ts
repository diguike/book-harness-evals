// 主入口：对五个 harness 模块同时算
//   1. 单消融 Δ（第 9 章）
//   2. 精确 Shapley 值（枚举排列）
//   3. 蒙特卡洛 Shapley 近似 + 收敛曲线
// 打印分账对照表，并核对两条"可加性"事实。
//
// 跑法：npm run shapley

import { MODULES, BASELINE, makeCachedPhi, phiSync } from './coalition-value.js';
import { exactShapley, monteCarloShapley, mulberry32 } from './shapley.js';
import { ablationDeltas } from './ablation.js';

function fmt(x: number): string {
  return (x >= 0 ? '+' : '') + x.toFixed(3);
}

async function main(): Promise<void> {
  const modules = [...MODULES];

  // Φ(全集) − Φ(∅)：整体效果的"总盘子"，Shapley 值要把它分完
  const totalLift = phiSync(new Set(modules)) - BASELINE;

  // ── 1. 单消融 Δ（第 9 章）──
  const { phi: phiAbl } = makeCachedPhi();
  const deltas = await ablationDeltas(modules, phiAbl);
  const sumDelta = modules.reduce((s, m) => s + deltas[m], 0);

  // ── 2. 精确 Shapley（共用一个带缓存的 phi，统计真实计算次数）──
  const { phi: phiExact, stats } = makeCachedPhi();
  const exact = await exactShapley(modules, phiExact);
  const sumShapley = modules.reduce((s, m) => s + exact[m], 0);

  // ── 3. 蒙特卡洛近似（固定种子，结果可复现）──
  const rand = mulberry32(42);
  const { phi: phiMc } = makeCachedPhi();
  const mc = await monteCarloShapley(modules, phiMc, 2000, rand);

  // ── 打印对照表 ──
  console.log('\n=== 模块贡献分账：单消融 Δ vs Shapley φ ===\n');
  console.log('模块             单消融Δ    Shapley φ(精确)   蒙特卡洛 φ̂(±SE)');
  console.log('─'.repeat(72));
  for (const m of modules) {
    const se = mc.stderr[m];
    const line = [
      m.padEnd(16),
      fmt(deltas[m]).padStart(8),
      fmt(exact[m]).padStart(14),
      `${fmt(mc.estimate[m])} ±${se.toFixed(3)}`.padStart(20),
    ].join('  ');
    console.log(line);
  }
  console.log('─'.repeat(72));
  console.log(
    `${'合计'.padEnd(16)}${fmt(sumDelta).padStart(8)}${fmt(sumShapley).padStart(14)}`,
  );

  // ── 核对两条可加性事实 ──
  console.log('\n=== 可加性核对 ===');
  console.log(`Φ(全集) − Φ(∅) = ${fmt(totalLift)}`);
  console.log(
    `ΣΔ            = ${fmt(sumDelta)}  ← 不等于总盘子，差 ${fmt(sumDelta - totalLift)}（消融不可加）`,
  );
  console.log(
    `Σφ(Shapley)   = ${fmt(sumShapley)}  ← 严格等于总盘子（Shapley 有效性公理）`,
  );

  // ── 缓存效果：N! 次遍历，实际只算了 2^N 个不同子集 ──
  console.log('\n=== 缓存效果（精确算法）===');
  console.log(`phi 调用次数  = ${stats.calls}`);
  console.log(`实际计算子集  = ${stats.computed}（应为 2^${modules.length} = ${2 ** modules.length}）`);

  // ── 收敛曲线：蒙特卡洛估计随采样数增加向精确值靠拢 ──
  console.log('\n=== 蒙特卡洛收敛曲线（以 reflection 为例，看 |φ̂ − φ精确|）===');
  console.log('samples   φ̂(reflection)   |误差|');
  for (const n of [50, 200, 800, 2000, 5000]) {
    const r = mulberry32(7);
    const { phi } = makeCachedPhi();
    const res = await monteCarloShapley(modules, phi, n, r);
    const err = Math.abs(res.estimate['reflection'] - exact['reflection']);
    console.log(`${String(n).padStart(6)}   ${fmt(res.estimate['reflection']).padStart(12)}   ${err.toFixed(4)}`);
  }

  console.log('\n读法提示：');
  console.log('  · φ 高于 Δ 的模块（searchRunbook / reflection）有冗余——满配下被伙伴盖住，单消融低估了它；');
  console.log('  · Δ 高于 φ 的模块（instructions）有互补——单消融把协同一并拿掉了，高估了它的纯贡献；');
  console.log('  · 误差随 samples 增大单调收窄，印证蒙特卡洛是无偏估计。\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
