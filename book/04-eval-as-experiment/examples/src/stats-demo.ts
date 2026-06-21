import {
  wilsonInterval,
  sampleSizePerGroup,
  twoProportionZTest,
  bonferroniThreshold,
} from './stats.js';

// 这个脚本把本章的统计工具逐个跑一遍，复现正文里的几个关键数字。
// 纯计算，不调用任何模型，不需要 API key。

function pct(x: number): string {
  return (x * 100).toFixed(1) + '%';
}

console.log('=== 1. 给评测分配误差棒：Wilson 区间 ===');
const ci = wilsonInterval(41, 50);
console.log(
  `50 条任务过了 41 条：点估计 ${pct(ci.point)}，` +
    `95% 区间 [${pct(ci.lower)}, ${pct(ci.upper)}]`,
);
console.log(
  '→ 区间宽到 ~0.21，凭这 50 条你只能确信"真实通过率大概七成到九成"。\n',
);

console.log('=== 2. 样本量要多大：先想清楚 MDE ===');
for (const delta of [0.1, 0.05, 0.02]) {
  console.log(
    `基线 80%、想稳稳检测出 +${pct(delta)} 提升：每组约需 ` +
      `${sampleSizePerGroup(0.8, delta)} 条任务`,
  );
}
console.log('→ 想分辨 0.02 要 ~6000 条；几十条的评测集只配下"大改进"的结论。\n');

console.log('=== 3. 比两版 harness：双比例 z 检验 ===');
const ab = twoProportionZTest(41, 50, 42, 50);
console.log(
  `A 版 41/50（${pct(41 / 50)}）vs B 版 42/50（${pct(42 / 50)}），` +
    `差 ${pct(ab.diff)}`,
);
console.log(`z = ${ab.z.toFixed(3)}，p 值 = ${ab.pValue.toFixed(3)}`);
console.log(
  '→ p 远大于 0.05：没有证据表明它俩有差别。0.82→0.84 不算进步。\n',
);

console.log('=== 4. 多重比较：Bonferroni 校正 ===');
console.log(
  `同时比 3 处改动，门槛从 0.05 收紧到 ${bonferroniThreshold(3).toFixed(4)}`,
);
console.log('→ 一个 p=0.04 的"显著"，在校正后就不算数了。');
