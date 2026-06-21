// run-ablation.ts —— 本章主脚本：
//   1) 对三个模块逐个单模块消融，算 Δi = Φ(H) − Φ(H−i)，每个带 Wilson 误差棒；
//   2) 把三个 Δi 加起来，和“全开 vs 全关”的整体提升对比 —— 当面看它们对不上；
//   3) 跑 searchRunbook × crossCheck 的全组合消融，用二阶差分把这对交互值抠出来。
//
// 跑法：npm run ablation

import { InteractingOncallAdapter, moduleIds } from './interacting-adapter.js';
import type { HarnessAdapter } from './adapter.js';
import { scoreSuite, type SuiteScore } from './score.js';
import { tasks } from './tasks.js';
import { wilsonInterval, fmtInterval } from './wilson.js';

/** 给定要关掉的模块集合，跑出该变体的整体分 */
async function scoreWith(base: HarnessAdapter, disable: string[]): Promise<SuiteScore> {
  const variant = disable.length ? base.withConfig({ disable }) : base;
  return scoreSuite(variant, tasks);
}

/**
 * 两个比例之差的近似 95% 误差棒：用两端 Wilson 区间半宽的勾股和。
 * Δ 是两个统计量相减，不确定性比单个分大；这里给一个工程上够用的粗略带宽。
 */
function deltaBand(a: SuiteScore, b: SuiteScore): number {
  const ha = (a.ci.high - a.ci.low) / 2;
  const hb = (b.ci.high - b.ci.low) / 2;
  return Math.sqrt(ha * ha + hb * hb);
}

async function main() {
  const base = new InteractingOncallAdapter();

  console.log('=== 第 9 章：消融实验与贡献不可加 ===\n');

  // 0) 完整 harness 的基线分 Φ(H)
  const full = await scoreWith(base, []);
  console.log(`完整 harness 基线 Φ(H) = ${fmtInterval(full.ci)}  (${full.passed}/${full.total})\n`);

  // 1) 单模块消融：逐个关掉，算 Δi
  console.log('--- 单模块消融 Δi = Φ(H) − Φ(H−i) ---');
  const deltas: Record<string, number> = {};
  for (const id of moduleIds) {
    const ablated = await scoreWith(base, [id]);
    const delta = full.score - ablated.score;
    deltas[id] = delta;
    const band = deltaBand(full, ablated);
    const crossesZero = delta - band <= 0 && delta + band >= 0;
    console.log(
      `  关掉 ${id.padEnd(13)} -> Φ(H−i)=${ablated.score.toFixed(3)}  ` +
        `Δ=${delta >= 0 ? '+' : ''}${delta.toFixed(3)} ± ${band.toFixed(3)}` +
        (crossesZero ? '  (误差棒跨过 0，慎下结论)' : ''),
    );
  }

  // 2) 可加性检验：ΣΔi vs 整体提升（全开 − 全关）
  const sumDelta = Object.values(deltas).reduce((a, b) => a + b, 0);
  const empty = await scoreWith(base, [...moduleIds]); // 全关
  const wholeGain = full.score - empty.score;

  console.log('\n--- 可加性检验 ---');
  console.log(`  ΣΔi（三个单模块消融之和） = ${sumDelta.toFixed(3)}`);
  console.log(`  整体提升（全开 Φ=${full.score.toFixed(3)} − 全关 Φ=${empty.score.toFixed(3)}） = ${wholeGain.toFixed(3)}`);
  console.log(
    `  缺口 = ΣΔi − 整体提升 = ${(sumDelta - wholeGain).toFixed(3)}` +
      `  <- 这就是被单模块消融重复计 / 漏计的交互效应`,
  );

  // 3) 全组合消融：抠出 searchRunbook × crossCheck 的交互值（二阶差分）
  // 固定 queryMetrics 始终开，对 {searchRunbook, crossCheck} 跑四种开关组合。
  console.log('\n--- 组合消融：searchRunbook × crossCheck 二阶差分 ---');
  const off = ['searchRunbook', 'crossCheck'];
  const both = await scoreWith(base, []); // 都开（= full）
  const onlyCross = await scoreWith(base, ['searchRunbook']); // 只开 crossCheck
  const onlyRunbook = await scoreWith(base, ['crossCheck']); // 只开 searchRunbook
  const neither = await scoreWith(base, off); // 都关

  console.log(`  都开            Φ = ${both.score.toFixed(3)}`);
  console.log(`  只开 crossCheck Φ = ${onlyCross.score.toFixed(3)}`);
  console.log(`  只开 runbook    Φ = ${onlyRunbook.score.toFixed(3)}`);
  console.log(`  都关            Φ = ${neither.score.toFixed(3)}`);

  // 交互项 = Φ(都开) − Φ(只开A) − Φ(只开B) + Φ(都关)
  const interaction =
    both.score - onlyCross.score - onlyRunbook.score + neither.score;
  console.log(
    `  交互项 = Φ(都开) − Φ(只开cross) − Φ(只开runbook) + Φ(都关) = ${interaction.toFixed(3)}`,
  );
  console.log(
    interaction > 0
      ? '  > 0：正交互（互补）—— 两个一起才把那批边界任务做对，少了哪个都用不上 runbook 先验。'
      : '  <= 0：冗余或无交互。',
  );

  console.log('\n结论：Δi 不可加。汇报模块贡献时别把它们相加；要公平分账，见第 10 章 Shapley。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
