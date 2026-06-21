// tasks.ts —— 本章的评测任务集（对齐第 5 章 EvalTask 形状）。
//
// 每个任务给一个服务，附带它的 metrics（错误率）与 runbook（已知故障先验），
// oracle.mustEscalate 是地面真值：到底该不该升级。
//
// 任务集刻意分三类，让“只看 metrics 的启发式（错误率>0.05 就升级）”在一部分上判错：
//   A. metrics 与 runbook 一致的“好做”任务 —— 谁来都能对。
//   B. 高错误率但 runbook 说能自愈（self-heal）—— 只看 metrics 会“过度升级”。
//   C. 低错误率但 runbook 说必须升级（should-escalate）—— 只看 metrics 会“漏升级”。
//
// B、C 两类只有靠 runbook 先验 + crossCheck 一起才做得对，
// 它们就是制造模块交互、让 Δi 不可加的那批任务。

import type { EvalTask } from './adapter.js';

interface Spec {
  service: string;
  errorRate: number;
  prior: 'should-escalate' | 'self-heal';
  mustEscalate: boolean;
  tier: 'smoke' | 'core' | 'hard'; // 难度档（第 6 章口径）：A 类 smoke，B/C 类边界任务 hard
}

// 每条 spec 复制 copies 份，凑足样本量让 Wilson 区间不至于太宽。
function expand(specs: Spec[], copies: number): EvalTask[] {
  const tasks: EvalTask[] = [];
  for (const s of specs) {
    for (let k = 0; k < copies; k++) {
      tasks.push({
        id: `${s.service}-${k}`,
        input: `值班告警：服务 ${s.service} 出现异常，请判断是否需要升级给人类 oncall。`,
        tier: s.tier,
        initialState: {
          metrics: { [s.service]: s.errorRate },
          runbook: { [s.service]: s.prior },
        },
        oracle: { mustEscalate: s.mustEscalate },
      });
    }
  }
  return tasks;
}

export const tasks: EvalTask[] = expand(
  [
    // A 类：metrics 与 runbook 一致，启发式也能对
    { service: 'auth-api', errorRate: 0.2, prior: 'should-escalate', mustEscalate: true, tier: 'smoke' },
    { service: 'cache', errorRate: 0.01, prior: 'self-heal', mustEscalate: false, tier: 'smoke' },
    // B 类：高错误率但能自愈 —— 只看 metrics 会过度升级
    { service: 'batch-job', errorRate: 0.3, prior: 'self-heal', mustEscalate: false, tier: 'hard' },
    { service: 'log-shipper', errorRate: 0.15, prior: 'self-heal', mustEscalate: false, tier: 'hard' },
    // C 类：低错误率但必须升级 —— 只看 metrics 会漏升级
    { service: 'payment', errorRate: 0.02, prior: 'should-escalate', mustEscalate: true, tier: 'hard' },
    { service: 'billing', errorRate: 0.03, prior: 'should-escalate', mustEscalate: true, tier: 'hard' },
  ],
  8, // 每条 8 份 -> 共 48 个任务
);
