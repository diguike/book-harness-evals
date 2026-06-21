// 主入口：把一整套稳定性评测跑起来。
//   1) 对任务集按风险标签分层重复跑（高危写跑高 n，只读跑低 n）
//   2) 每题估 pass^k + flakiness + bootstrap CI
//   3) 双重门禁判定（整体 pass^k 达标 且 无单任务 flakiness 超限）
//   4) 抖动归因对照：逐一压制随机源，看 flakiness 降不降
//
// 跑：npm i && npm run stability

import { FlakyOncallAdapter, type StabilityTask } from './flaky-adapter.js';
import { repeatRun } from './repeat-run.js';
import {
  bootstrapPassHatKCI,
  estimatePassHatK,
  flakiness,
  passAtK,
  passHatK,
} from './passk.js';

// 评估 pass^k 时关心的 k：线上一晚会处理多次告警，看连续 5 次都对的概率
const K = 5;

// 任务集：一条高危写任务（抖）+ 两条只读任务（稳）。
// 这样整体分被两条稳定任务摊高，单看聚合 pass^k 会放抖动任务过门——
// 正好演示"为什么聚合分不够、必须再加一道单任务 flakiness 门禁"。
// risk 标签决定重复次数（第 6 章构造任务集时打的标签）。
const TASKS: StabilityTask[] = [
  {
    id: 'pay-escalate',
    input: '告警：payment 服务错误率升高，请处置',
    tier: 'hard', // 难度档（第 6 章写入）：要做对处置决策，最难
    oracle: { expectedFinalState: { action: 'escalated' }, mustEscalate: true },
    risk: 'high-write', // 涉及 restartService 这类高危写 → 跑高 n，且这条会抖
  },
  {
    id: 'pay-logs',
    input: '查一下 payment 服务最近的错误日志',
    tier: 'smoke', // 只读冒烟，行为确定
    oracle: { expectedFinalState: { action: 'reported' } },
    risk: 'read-only', // 只读、行为确定 → 跑低 n，稳定通过
  },
  {
    id: 'pay-metrics',
    input: '看下 payment 服务的监控指标',
    tier: 'smoke',
    oracle: { expectedFinalState: { action: 'reported' } },
    risk: 'read-only',
  },
];

/** 按风险标签决定重复次数：高危写跑多次盯稳定性，只读省成本 */
function repeatsFor(task: StabilityTask): number {
  return task.risk === 'high-write' ? 12 : 3;
}

interface TaskStability {
  taskId: string;
  successes: number;
  total: number;
  k: number; // 这条任务实际用的 k（= min(K, 重复次数)）
  passHatK: number;
  flakiness: number;
  ci: { point: number; lower: number; upper: number };
}

async function measure(adapter: FlakyOncallAdapter, tasks: StabilityTask[]): Promise<TaskStability[]> {
  const out: TaskStability[] = [];
  for (const task of tasks) {
    const n = repeatsFor(task);
    const rep = await repeatRun(adapter, task, n);
    // 每题的 k 不能超过它实际重复的次数：低 n 的只读任务用 k=min(K,n)，
    // 否则 C(c,k)/C(n,k) 在 k>n 时无定义。flakiness 不依赖 k，按全样本算。
    const kTask = Math.min(K, rep.total);
    out.push({
      taskId: task.id,
      successes: rep.successes,
      total: rep.total,
      k: kTask,
      passHatK: estimatePassHatK(rep.successes, rep.total, kTask),
      flakiness: flakiness(rep.successes, rep.total),
      ci: bootstrapPassHatKCI(rep.outcomes, kTask, { rng: makeRng(7) }),
    });
  }
  return out;
}

/** 双重门禁：整体 pass^k 达标 且 没有单任务 flakiness 超限 */
function reliabilityGate(
  perTask: { taskId: string; passHatK: number; flakiness: number }[],
  opts: { minOverallPassHatK: number; maxFlakiness: number },
): { overall: number; pass: boolean; flakyTasks: string[] } {
  const overall =
    perTask.reduce((s, t) => s + t.passHatK, 0) / Math.max(1, perTask.length);
  // 揪出抖动超限的任务：它们即便没拉低平均分，也要单独拦下
  const flakyTasks = perTask.filter((t) => t.flakiness > opts.maxFlakiness).map((t) => t.taskId);
  const pass = overall >= opts.minOverallPassHatK && flakyTasks.length === 0;
  return { overall, pass, flakyTasks };
}

function printTable(title: string, rows: TaskStability[]): void {
  console.log(`\n=== ${title} ===`);
  for (const r of rows) {
    console.log(
      `  ${r.taskId.padEnd(14)} p̂=${(r.successes / r.total).toFixed(2)} ` +
        `pass^${r.k}=${r.passHatK.toFixed(3)} ` +
        `[${r.ci.lower.toFixed(3)}, ${r.ci.upper.toFixed(3)}] ` +
        `flakiness=${r.flakiness.toFixed(3)} (${r.successes}/${r.total})`,
    );
  }
}

async function main(): Promise<void> {
  // 先演示解析式：p=0.9 时 pass@5 高、pass^5 低，方向相反
  console.log('解析式对照（单次成功率 p=0.9）：');
  console.log(`  pass@${K} = ${passAtK(0.9, K).toFixed(3)}  (能力上界，乐观)`);
  console.log(`  pass^${K} = ${passHatK(0.9, K).toFixed(3)}  (可靠性下界，悲观)`);

  const gateOpts = { minOverallPassHatK: 0.7, maxFlakiness: 0.2 };

  // ① 抖动状态：召回顺序不稳（deterministicRunbookOrder=false）。这就是发布上线的那一版。
  const flaky = new FlakyOncallAdapter({ deterministicRunbookOrder: false, temperature: 0 });
  const before = await measure(flaky, TASKS);
  printTable('发布版：召回顺序不稳', before);
  const g1 = reliabilityGate(before, gateOpts);
  console.log(
    `  门禁：overall 可靠性分=${g1.overall.toFixed(3)}（≥${gateOpts.minOverallPassHatK} 即达标）→ ${g1.pass ? '放行' : '拦下'}` +
      (g1.flakyTasks.length ? `（抖动超限：${g1.flakyTasks.join(', ')}）` : ''),
  );

  // ② 抖动归因对照（第 1 类）：把 temperature 压到 0 已经是 0，再压无效——
  //    说明抖动不在模型采样。flakiness 没动，往工具/环境上找。
  const temp0 = flaky.withConfig({ replace: { temperature: 0 } }) as FlakyOncallAdapter;
  const afterTemp = await measure(temp0, TASKS);
  printTable('对照A：temperature→0（不是这个来源）', afterTemp);

  // ③ 抖动归因对照（第 2 类）：给召回结果加确定性排序。锁定真正的来源。
  const sorted = flaky.withConfig({ replace: { deterministicRunbookOrder: true } }) as FlakyOncallAdapter;
  const afterSort = await measure(sorted, TASKS);
  printTable('对照B：召回结果确定排序（命中来源）', afterSort);
  const g2 = reliabilityGate(afterSort, gateOpts);
  console.log(
    `  门禁：overall 可靠性分=${g2.overall.toFixed(3)}（≥${gateOpts.minOverallPassHatK} 即达标）→ ${g2.pass ? '放行' : '拦下'}`,
  );

  console.log(
    '\n结论：temperature 设 0 治不了抖动（对照A flakiness 不变），' +
      '给 searchRunbook 召回加确定排序后 flakiness 归零（对照B），抖动来源锁定为工具返回非确定。',
  );
}

/** 给 bootstrap 一个可复现的伪随机数发生器，保证每次跑结果一致 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
