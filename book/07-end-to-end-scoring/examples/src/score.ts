// harness-lab/src/score.ts —— 第 7 章主流程：并发回放 → 状态基评分 → 多维聚合 → 带 CI 报分。
//
// 默认用 mock 适配器（不需要模型 key）：  npm run score
// 接真模型时：去掉 mock、换 MastraOncallAdapter，并配好 OPENAI_API_KEY：  npm run score -- --real
//
// 末尾对比两版 harness（合理阈值 vs 次优阈值），演示整体分能把两版区分开——
// 这正是整体效果评测要回答的问题："这套 harness 整体到底行不行、比另一套强不强"。

import type { HarnessAdapter, RunResult } from './adapter.js';
import { MockOncallAdapter } from './mock-adapter.js';
import { MastraOncallAdapter } from './mastra-adapter.js';
import { taskSuite } from './task-suite.js';
import { runSuite } from './runner.js';
import { scoreState, type StateScore } from './state-scorer.js';
import { aggregate, type SuiteReport } from './aggregate.js';
import { fmtInterval } from './stats.js';

const instructions =
  '你是值班助手。先查监控，错误率超过 0.05 必须 escalateOncall，不要改配置。';

/** 跑完整条流水线，返回报告（供两版对比复用） */
async function evaluate(adapter: HarnessAdapter): Promise<{ report: SuiteReport; scores: StateScore[] }> {
  // 1. 并发回放整个任务集（每个任务隔离 world，可放心并发）
  const results: RunResult[] = await runSuite(adapter, taskSuite, { concurrency: 4, seed: 42 });
  // 2. 逐任务状态基评分（确定性，零方差）
  const scores = taskSuite.map((task, i) => scoreState(task, results[i]));
  // 3. 多维聚合 + Wilson CI（传入 taskSuite 是为了按 tier 分层）
  const report = aggregate(scores, results, taskSuite);
  return { report, scores };
}

function printReport(name: string, report: SuiteReport) {
  console.log(`\n===== ${name}（n=${report.n}）=====`);
  console.log('正确率(状态基) :', fmtInterval(report.correctness));
  console.log('安全率         :', fmtInterval(report.safety));
  for (const tier of ['smoke', 'core', 'hard'] as const) {
    const t = report.byTier[tier];
    if (t.n) console.log(`  ${tier.padEnd(5)}(n=${t.n}) :`, fmtInterval(t.correctness));
  }
  console.log('平均 token/任务:', report.cost.avgTokens);
  console.log('平均/95分位时延:', `${report.cost.avgMs}ms / ${report.cost.p95Ms}ms`);
  if (report.failures.length) {
    console.log('未通过任务     :');
    for (const f of report.failures) {
      console.log(`  - ${f.taskId}: ${f.reasons.join('；')}`);
    }
  }
}

async function main() {
  const useReal = process.argv.includes('--real');

  // 主版本：合理阈值 0.05。真实评测把它换成 MastraOncallAdapter
  const good: HarnessAdapter = useReal
    ? new MastraOncallAdapter({ disabled: new Set(), instructions })
    : new MockOncallAdapter({ disabled: new Set(), instructions, threshold: 0.05 });

  const { report } = await evaluate(good);
  printReport(`适配器 ${good.name}`, report);

  // 不接真模型时，再跑一版"次优 harness"做对比：阈值调到 0.1，
  // 会漏掉 cart(0.06) 那条边界升级 —— 整体正确率应当明显掉下来。
  if (!useReal) {
    const bad = new MockOncallAdapter({ disabled: new Set(), instructions, threshold: 0.1 });
    const { report: badReport } = await evaluate(bad);
    printReport('次优变体（阈值 0.1，会漏边界升级）', badReport);

    console.log('\n[对比结论] 整体正确率从',
      fmtInterval(report.correctness), '掉到', fmtInterval(badReport.correctness),
      '\n两个区间是否重叠，决定这次差异是不是噪声（第 4 章显著性，第 16 章门禁用得上）。');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
