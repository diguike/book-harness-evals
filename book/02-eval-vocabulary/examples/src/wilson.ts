// Wilson 置信区间：评测分是统计量，报分必带误差棒
// 小样本 / 极端比例下，比正态近似 p ± 1.96·√(p(1-p)/n) 稳健得多

/** n 次试验成功 success 次，返回二项比例的 95% Wilson 置信区间 */
export function wilsonInterval(
  success: number,
  n: number,
): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 };
  const z = 1.96; // 95% 置信水平对应的 z 分位数
  const p = success / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  // 夹到 [0,1]，避免极端情况下越界
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

/** 对照用：教科书正态近似，小样本下会失真（甚至越过 0/1 边界） */
export function normalApprox(
  success: number,
  n: number,
): { lower: number; upper: number } {
  const p = success / n;
  const margin = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return { lower: p - margin, upper: p + margin };
}

function pct(x: number): string {
  return (x * 100).toFixed(1) + '%';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // 值班助手评测：50 条任务成了 46 条
  const cases: Array<[number, number]> = [
    [46, 50], // 本章正文用例
    [9, 10], // 极端比例：贴近 1，正态近似会越界 100%
    [1, 5], // 极小样本
  ];

  for (const [success, n] of cases) {
    const w = wilsonInterval(success, n);
    const norm = normalApprox(success, n);
    console.log(`\n${success}/${n} = ${pct(success / n)}`);
    console.log(`  Wilson 95% CI : [${pct(w.lower)}, ${pct(w.upper)}]`);
    console.log(`  正态近似 95% CI: [${pct(norm.lower)}, ${pct(norm.upper)}]`);
  }

  console.log(
    '\n结论：46/50 的 Wilson 区间约 [81%, 97%]，区间这么宽，' +
      '3 个百分点的"提升"基本说明不了问题——不带 CI 的评测分不能用来做决策。',
  );
}
