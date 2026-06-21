// 一整条线上持续评估闭环的演示：影子 → A/B → 灰度 → 信号回流离线。
// 复现开头那次故障：新版（关键词表）把大量常规扩容操作误升级，离线测不出，线上才暴露。
// 全程不依赖真实 LLM，确定性、可复现。跑：npm run demo

import { MockOncallAdapter, makeTraffic, trafficToTask } from './mock-harness.js';
import { runShadow, shadowGate } from './shadow.js';
import { runAB, decideAB } from './ab.js';
import { runCanary } from './canary.js';
import { sampleSizePerGroup } from './stats.js';
import type { EvalTask } from './adapter.js';

async function main() {
  // 主版本 = 老版（模型自判升级）；候选版 = 新版（关键词表，过度严格）
  const primary = new MockOncallAdapter('model-judge');
  const candidate = new MockOncallAdapter('keyword-table');

  // 一批真实流量：60% 是常规扩容（安全、不该升级，离线集里没有）
  const traffic = makeTraffic(400);

  console.log('=== 第 15 章：线上持续评估闭环 ===\n');
  console.log(`真实流量样本数: ${traffic.length}`);
  console.log(
    `（其中常规扩容约 ${Math.round(0.6 * traffic.length)} 条 —— 离线任务集的盲区）\n`,
  );

  // ---------- 1. 影子：候选版只读 dry-run，比行为分布 ----------
  console.log('--- 1) 影子流量比对 ---');
  const shadow = await runShadow(primary, candidate, traffic);
  console.log('四桶分布:', shadow.buckets);
  const sGate = shadowGate(shadow);
  console.log(`影子门禁: ${sGate.pass ? '通过' : '拦截'} —— ${sGate.reason}\n`);

  if (!sGate.pass) {
    console.log(
      '影子已拦下候选版：大量常规操作被新版误升级，落在"候选更差"桶。\n' +
        '这正是开头那次"过度升级"故障 —— 本可在上线前就被这道关挡住。\n',
    );
  }

  // ---------- 2. A/B：小比例真实流量，做显著性结论 ----------
  // 先估样本量：baseline 通过率约 0.95，想检出 5 个百分点变化，每组要多少样本
  console.log('--- 2) A/B 分流对照实验 ---');
  console.log(
    `开实验前估样本量（baseline=0.95，想检出 0.05 变化）: 每组约 ${sampleSizePerGroup(
      0.95,
      -0.05,
    )} 条\n`,
  );
  const { a, b } = await runAB(primary, candidate, traffic, 0.5);
  const ab = decideAB(a, b);
  console.log(
    `A(老版) 通过率: ${(ab.ciA.point * 100).toFixed(1)}% ` +
      `[${(ab.ciA.lower * 100).toFixed(1)}%, ${(ab.ciA.upper * 100).toFixed(1)}%]`,
  );
  console.log(
    `B(新版) 通过率: ${(ab.ciB.point * 100).toFixed(1)}% ` +
      `[${(ab.ciB.lower * 100).toFixed(1)}%, ${(ab.ciB.upper * 100).toFixed(1)}%]`,
  );
  console.log(
    `差异 diff(B-A)=${(ab.diff * 100).toFixed(1)}%, p=${ab.pValue.toFixed(
      4,
    )}, Bonferroni 门槛=${ab.threshold.toFixed(4)}`,
  );
  console.log(`A/B 判定: ${ab.verdict}\n`);

  // ---------- 3. 灰度：阶梯放量 + 自动回滚门限 ----------
  console.log('--- 3) 灰度放量（守护性 + 趋势性门限）---');
  const canary = await runCanary(primary, candidate, traffic);
  for (const w of canary.windows) {
    console.log(
      `  放量 ${(w.stage * 100).toFixed(0).padStart(3)}% | ` +
        `守护性违规=${w.guardrail.violations} | 趋势=${w.trend.verdict} | ` +
        `决定=${w.decision === 'advance' ? '放行' : '回滚'}`,
    );
  }
  console.log(
    `灰度结果: ${
      canary.rolledBack
        ? `回滚，停在 ${(canary.finalStage * 100).toFixed(0)}% 安全档`
        : '全量成功'
    }\n`,
  );

  // ---------- 4. 信号回流离线：把"候选更差"样本沉淀成回归集 ----------
  console.log('--- 4) 线上信号回流离线（带人工审，不自动入集）---');
  const newSamples: EvalTask[] = shadow.diffs
    .filter((d) => d.bucket === 'candidate-worse' || d.bucket === 'new-violation')
    .slice(0, 5) // 演示只捞前 5 条
    .map((d) => {
      const item = traffic.find((t) => t.id === d.taskId)!;
      return trafficToTask(item); // 带 oracle，可直接加进第 6/7 章回归集
    });
  console.log(
    `从线上捞出 ${
      shadow.diffs.filter((d) => d.bucket === 'candidate-worse').length
    } 条"候选更差"样本，规整成带 oracle 的 EvalTask 候选（示例展示前 ${newSamples.length} 条）:`,
  );
  for (const s of newSamples) {
    console.log(
      `  - ${s.id}: "${s.input}"  oracle.mustEscalate=${s.oracle?.mustEscalate}`,
    );
  }
  console.log(
    '\n这些样本交人工审一道再入回归集（第 6 章），下次改动离线就能提前拦同类问题（第 16 章）。',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
