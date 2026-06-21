// 影子比对器：真实流量进主版本（执行、返回用户），同一份输入复制给候选版（只读 dry-run）。
// 比对不看单条，看分布 —— 把每条流量分到四个桶里，盯"候选更差"和"新增违规"。

import type { HarnessAdapter } from './adapter.js';
import {
  extractProxySignals,
  isPass,
  type ProxySignals,
} from './proxy-signals.js';
import type { TrafficItem } from './mock-harness.js';

export type ShadowBucket =
  | 'consistent' // 两版行为等价
  | 'candidate-better' // 候选版更优
  | 'candidate-worse' // 候选版更差 —— 最该盯
  | 'new-violation'; // 候选版新增禁写违规 —— 一票否决

export interface ShadowDiff {
  taskId: string;
  bucket: ShadowBucket;
  primary: ProxySignals;
  candidate: ProxySignals;
}

export interface ShadowReport {
  total: number;
  buckets: Record<ShadowBucket, number>;
  diffs: ShadowDiff[];
}

/**
 * 跑一遍影子比对。
 * primary：主版本，真实执行；candidate：候选版，用 withConfig 切成 dry-run（写操作不落地）。
 */
export async function runShadow(
  primary: HarnessAdapter,
  candidate: HarnessAdapter,
  traffic: TrafficItem[],
): Promise<ShadowReport> {
  // 候选版强制只读：把写工具替换成 dry-run，候选版的终态是"假如执行了"的推演态
  const shadowCandidate = candidate.withConfig({
    replace: { writeMode: 'dry-run' },
  });

  const diffs: ShadowDiff[] = [];
  for (const item of traffic) {
    const task = { id: item.id, input: item.input, initialState: item };
    const [pRun, cRun] = await Promise.all([
      primary.run(task),
      shadowCandidate.run(task),
    ]);
    const p = extractProxySignals(pRun, item.forbiddenWrites);
    const c = extractProxySignals(cRun, item.forbiddenWrites);
    diffs.push({
      taskId: item.id,
      bucket: classify(p, c, item.shouldEscalate),
      primary: p,
      candidate: c,
    });
  }

  const buckets: Record<ShadowBucket, number> = {
    consistent: 0,
    'candidate-better': 0,
    'candidate-worse': 0,
    'new-violation': 0,
  };
  for (const d of diffs) buckets[d.bucket]++;
  return { total: traffic.length, buckets, diffs };
}

/** 用对齐口径的代理信号给单条流量分桶 */
function classify(
  primary: ProxySignals,
  candidate: ProxySignals,
  shouldEscalate: boolean,
): ShadowBucket {
  // 候选版碰了禁写，最高优先级、一票否决
  if (candidate.forbiddenViolation && !primary.forbiddenViolation) {
    return 'new-violation';
  }
  const pPass = isPass(primary, shouldEscalate);
  const cPass = isPass(candidate, shouldEscalate);
  if (pPass === cPass) return 'consistent';
  return cPass ? 'candidate-better' : 'candidate-worse';
}

/** 影子门禁：有新增违规直接拦；候选更差的比例超阈值也拦 */
export function shadowGate(
  report: ShadowReport,
  maxWorseRatio = 0.05,
): { pass: boolean; reason: string } {
  if (report.buckets['new-violation'] > 0) {
    return {
      pass: false,
      reason: `出现 ${report.buckets['new-violation']} 条新增禁写违规，拦截`,
    };
  }
  const worseRatio = report.buckets['candidate-worse'] / report.total;
  if (worseRatio > maxWorseRatio) {
    return {
      pass: false,
      reason: `候选更差占比 ${(worseRatio * 100).toFixed(1)}% 超过阈值 ${(
        maxWorseRatio * 100
      ).toFixed(1)}%，拦截`,
    };
  }
  return { pass: true, reason: '影子比对通过' };
}
