/**
 * src/verify.ts —— 跑两件事：
 *   1) 校验来源台账（诚实边界 lint，可放进 CI）
 *   2) 复现“模块贡献不可加”
 * 运行：npm run verify
 */
import { SOURCES, lintLedger } from './ledger.js';
import { runNonAdditive } from './non-additive.js';

let exitCode = 0;

// —— 1. 台账 lint ——
console.log('=== 来源台账 lint（诚实边界检查）===');
const errors = lintLedger(SOURCES);
if (errors.length === 0) {
  console.log(`通过：${SOURCES.length} 条来源全部合规（C 档均带 caveat 与复现状态）。\n`);
} else {
  console.log('未通过：');
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log('');
  exitCode = 1;
}

// —— 2. “不可加”复现 ——
console.log('=== 复现：模块贡献不可加 ===');
const r = runNonAdditive();
for (const [mod, d] of Object.entries(r.perModuleDelta)) {
  console.log(`  Δ(${mod}) = ${d.toFixed(1)} pp`);
}
console.log(`  ΣΔi          = ${r.sumOfDeltas.toFixed(1)} pp（朴素相加的预期）`);
console.log(`  整体增益     = ${r.wholeGain.toFixed(1)} pp（三模块一起上的实测）`);
console.log(`  交互(冗余)项 = ${r.interactionGap.toFixed(1)} pp（被相加吞掉的部分）`);

if (r.interactionGap <= 0) {
  console.log('  ✗ 交互项应为正：本例未体现不可加，检查效用函数');
  exitCode = 1;
} else {
  console.log('  ✓ ΣΔi ≠ 整体增益 —— 对应第 9 章“贡献不可加”、第 10 章用 Shapley 分账');
}

process.exit(exitCode);
