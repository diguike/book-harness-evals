// 用 LLM 当 judge 给质量打分时，judge 自己就是个会抖的随机变量。
// 这部分噪声 Wilson 区间盖不住，得靠"对同一样本重复打 k 次"把它估出来。

/**
 * 对同一条 (input, output) 让 judge 重复打分 k 次，估它自己的噪声。
 * 标准差越大，说明 judge 在这条样本上越不稳，它的打分越不能当真值用。
 */
export async function estimateJudgeNoise(
  judge: (input: string, output: string) => Promise<number>,
  input: string,
  output: string,
  k = 8,
): Promise<{ mean: number; std: number; samples: number[] }> {
  const samples: number[] = [];
  for (let i = 0; i < k; i++) {
    samples.push(await judge(input, output));
  }
  const mean = samples.reduce((a, b) => a + b, 0) / k;
  const variance =
    samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (k - 1);
  return { mean, std: Math.sqrt(variance), samples };
}

/**
 * 把抽样波动和 judge 噪声合并成整体分的 95% 误差棒半宽。
 * 两个来源相互独立，方差直接相加：
 *   Var(s̄) ≈ p̂(1−p̂)/n  +  σ_judge²/(n·k)
 * 抽样那一项随 n 衰减，judge 那一项随 n·k 衰减——加大 k（每条多打几次取均值）
 * 能单独把 judge 噪声压下去，不用扩任务集。k 和 estimateJudgeNoise 的参数同名同义。
 */
export function combinedHalfWidth(
  pHat: number, // 整体通过率/平均分点估计
  n: number, // 任务数
  judgeStd: number, // 单条样本上 judge 的打分标准差（estimateJudgeNoise 估出来的）
  k = 1, // 每条样本重复打分取均值的次数
  z = 1.96,
): number {
  const samplingVar = (pHat * (1 - pHat)) / n;
  const judgeVar = (judgeStd * judgeStd) / (n * k);
  return z * Math.sqrt(samplingVar + judgeVar);
}

// ---- 下面是可独立运行的演示 ----
// 默认用一个"带噪声的假 judge"模拟真实 LLM judge 的抖动，不需要 API key。
// 真实用法：把 fakeJudge 换成一个真的调用 Mastra LLM scorer 的函数即可，
// 形状一样：(input, output) => Promise<0..1 的分数>。

// 一个会抖的假 judge：真值是 0.7，每次打分叠一点随机噪声后裁剪到 [0,1]
function makeFakeJudge(trueScore: number, noise: number) {
  return async (_input: string, _output: string): Promise<number> => {
    const raw = trueScore + (Math.random() - 0.5) * 2 * noise;
    return Math.max(0, Math.min(1, raw));
  };
}

async function main() {
  const input = '支付服务最近有报错吗？';
  const output = '支付服务最近 15 分钟没有 ERROR 级别日志，但 WARN 略有上升。';

  console.log('=== judge 噪声估计：对同一条样本重复打分 8 次 ===\n');

  // 温度高的 judge：抖得厉害
  const noisyJudge = makeFakeJudge(0.7, 0.2);
  const noisy = await estimateJudgeNoise(noisyJudge, input, output, 8);
  console.log('高噪声 judge（模拟温度偏高）：');
  console.log('  采样：', noisy.samples.map(s => s.toFixed(2)).join(', '));
  console.log(`  均值 ${noisy.mean.toFixed(3)}，标准差 ${noisy.std.toFixed(3)}`);
  console.log('  → 标准差大，这条样本上的打分不能直接当真值。\n');

  // 温度调到 0、prompt 写死后的 judge：基本不抖
  const stableJudge = makeFakeJudge(0.7, 0.02);
  const stable = await estimateJudgeNoise(stableJudge, input, output, 8);
  console.log('低噪声 judge（模拟温度=0 + 取多数票）：');
  console.log('  采样：', stable.samples.map(s => s.toFixed(2)).join(', '));
  console.log(`  均值 ${stable.mean.toFixed(3)}，标准差 ${stable.std.toFixed(3)}`);
  console.log('  → 能压住的波动就别让它进结论。\n');

  // ---- 合并两类波动到同一个误差棒 ----
  console.log('=== 把抽样波动 + judge 噪声合并成整体分误差棒 ===');
  const pHat = 0.82;
  const n = 50;
  // 只看抽样波动（judgeStd=0）：等价于纯 Wilson 量级
  const samplingOnly = combinedHalfWidth(pHat, n, 0);
  // 带上高噪声 judge、每条只打 1 次
  const withNoisyJudge = combinedHalfWidth(pHat, n, noisy.std, 1);
  // 同一个高噪声 judge，但每条打 8 次取均值（k=8）
  const withNoisyJudgeK8 = combinedHalfWidth(pHat, n, noisy.std, 8);
  console.log(`  只算抽样波动：半宽 ±${samplingOnly.toFixed(3)}`);
  console.log(`  叠加高噪声 judge（k=1）：半宽 ±${withNoisyJudge.toFixed(3)}（更宽）`);
  console.log(`  同一 judge 但每条打 8 次取均值（k=8）：半宽 ±${withNoisyJudgeK8.toFixed(3)}`);
  console.log('  → judge 噪声随 k 衰减，加大 k 就能单独压住它，不用扩任务集。');
}

main();
