// 灰度放量：候选版流量占比阶梯式放大，每档停一个观察窗算门禁，触线就自动回滚到上一档。
// 门限分两类：守护性（一票否决，不看显著性）、趋势性（看显著性，确认没显著变差才放行）。

import type { HarnessAdapter } from './adapter.js';
import { extractProxySignals } from './proxy-signals.js';
import type { TrafficItem } from './mock-harness.js';
import { runAB, decideAB, assignArm } from './ab.js';

/** 灰度阶梯：候选版占比逐级放大 */
export const CANARY_STAGES = [0.01, 0.05, 0.25, 0.5, 1.0];

export interface CanaryWindowResult {
  stage: number; // 本档候选版占比
  guardrail: { violations: number; ok: boolean };
  trend: { verdict: string; diff: number; pValue: number; ok: boolean };
  decision: 'advance' | 'rollback';
}

export interface CanaryRun {
  windows: CanaryWindowResult[];
  finalStage: number; // 停在哪一档：1.0 = 全量成功
  rolledBack: boolean;
}

/**
 * 守护性门限：统计本档落到候选版那部分流量里有没有禁写违规。
 * 命中 > 0 立即回滚，不看显著性 —— 底线问题不容你慢慢攒样本。
 * 生产里这里还应加误改率绝对红线、p99 时延爆表等，本例以违规数示意。
 */
async function checkGuardrail(
  candidate: HarnessAdapter,
  traffic: TrafficItem[],
  stage: number,
): Promise<{ violations: number; ok: boolean }> {
  let violations = 0;
  for (const item of traffic) {
    if (assignArm(item.id, stage) !== 'B') continue; // 只看分到候选版的流量
    const run = await candidate.run({
      id: item.id,
      input: item.input,
      initialState: item,
    });
    const s = extractProxySignals(run, item.forbiddenWrites);
    if (s.forbiddenViolation) violations++;
  }
  return { violations, ok: violations === 0 };
}

/**
 * 跑完整灰度：逐档放量，每档算守护性 + 趋势性门限。
 * 任一档守护性命中或趋势显著变差，就回滚停在上一安全档。
 */
export async function runCanary(
  primary: HarnessAdapter, // A：当前主版本（老版）
  candidate: HarnessAdapter, // B：候选版（新版）
  traffic: TrafficItem[],
): Promise<CanaryRun> {
  const windows: CanaryWindowResult[] = [];
  let lastSafe = 0;

  for (const stage of CANARY_STAGES) {
    // 守护性门限（先看底线）
    const guardrail = await checkGuardrail(candidate, traffic, stage);

    // 趋势性门限：本档观察窗按 stage 比例分流，比 A、B 通过率有没有显著变差
    const { a, b } = await runAB(primary, candidate, traffic, stage);
    const ab = decideAB(a, b);
    const trend = {
      verdict: ab.verdict,
      diff: ab.diff,
      pValue: ab.pValue,
      ok: ab.verdict !== 'B 显著更差，回滚',
    };

    const advance = guardrail.ok && trend.ok;
    windows.push({
      stage,
      guardrail,
      trend,
      decision: advance ? 'advance' : 'rollback',
    });

    if (!advance) {
      return { windows, finalStage: lastSafe, rolledBack: true };
    }
    lastSafe = stage;
  }

  return { windows, finalStage: 1.0, rolledBack: false };
}
