// A/B 分流：真实流量按稳定哈希随机分到 A（老版）/ B（新版），两版都真实执行。
// 这是一次正经对照实验，第 4 章统计纪律全部生效：Wilson 区间、双比例 z 检验、Bonferroni。

import type { HarnessAdapter } from './adapter.js';
import { extractProxySignals, isPass } from './proxy-signals.js';
import type { TrafficItem } from './mock-harness.js';
import {
  wilsonInterval,
  twoProportionZTest,
  bonferroniThreshold,
} from './stats.js';

export interface ArmStats {
  arm: 'A' | 'B';
  pass: number;
  total: number;
}

export interface ABVerdict {
  verdict: 'B 显著更好' | 'B 显著更差，回滚' | '差异不显著，继续观察或加样本';
  diff: number; // pB - pA
  pValue: number;
  threshold: number; // Bonferroni 校正后的门槛
  ciA: { lower: number; upper: number; point: number };
  ciB: { lower: number; upper: number; point: number };
}

/** 稳定哈希分桶：同一条流量永远落同一臂（真实里按会话 id 哈希） */
export function assignArm(id: string, bRatio = 0.5): 'A' | 'B' {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000 < bRatio ? 'B' : 'A';
}

/** 跑一轮 A/B：按比例分流，两版都真实执行，累计各臂通过率 */
export async function runAB(
  armA: HarnessAdapter,
  armB: HarnessAdapter,
  traffic: TrafficItem[],
  bRatio = 0.5,
): Promise<{ a: ArmStats; b: ArmStats }> {
  const a: ArmStats = { arm: 'A', pass: 0, total: 0 };
  const b: ArmStats = { arm: 'B', pass: 0, total: 0 };
  for (const item of traffic) {
    const arm = assignArm(item.id, bRatio);
    const harness = arm === 'B' ? armB : armA;
    const stats = arm === 'B' ? b : a;
    const run = await harness.run({
      id: item.id,
      input: item.input,
      initialState: item,
    });
    const signals = extractProxySignals(run, item.forbiddenWrites);
    stats.total++;
    if (isPass(signals, item.shouldEscalate)) stats.pass++;
  }
  return { a, b };
}

/**
 * A/B 判定：比 A、B 两版通过率，带 Wilson 区间、双比例 z 检验、Bonferroni 校正。
 * numMetrics 是同时盯的指标数（这里举例 4 个：通过率/误改率/升级率/时延），门槛据此收紧。
 */
export function decideAB(a: ArmStats, b: ArmStats, numMetrics = 4): ABVerdict {
  const ciA = wilsonInterval(a.pass, a.total);
  const ciB = wilsonInterval(b.pass, b.total);
  // 约定第一组传 B、第二组传 A，于是 diff = pB - pA，>0 表示新版更高
  const test = twoProportionZTest(b.pass, b.total, a.pass, a.total);
  const threshold = bonferroniThreshold(numMetrics);
  const significant = test.pValue < threshold;
  let verdict: ABVerdict['verdict'] = '差异不显著，继续观察或加样本';
  if (significant && test.diff > 0) verdict = 'B 显著更好';
  else if (significant && test.diff < 0) verdict = 'B 显著更差，回滚';
  return { verdict, diff: test.diff, pValue: test.pValue, threshold, ciA, ciB };
}
