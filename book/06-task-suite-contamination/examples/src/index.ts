// 把整条流程串起来跑一遍：
// 生成式实例化一批任务 → 注入 canary → 切公开集/保留集 → 模拟两集得分 → 污染判定。
//
// 为了让示例自包含、不依赖真实模型，这里用一个"会背演练题答案"的桩 agent
// 模拟两种局面：被污染（公开集异常高）与未污染（两集吻合），看判定器的反应。

import { generatePoolSuite, seededRng } from './generator.js';
import { injectCanaries, probeContamination, type TaskWithCanary } from './canary.js';
import { splitSuite } from './split.js';
import { judgeContamination, type SuiteScore } from './contamination.js';
import type { EvalTask, Range } from './types.js';

/**
 * 桩 agent：根据是否"背过"来决定一道题的成败。
 * - 未污染场景：按合理区间处置，过题概率只和任务难度有关（两集同分布）。
 * - 被污染场景：公开集里的题它"背过答案"，正好命中区间，过题率被抬高；
 *   保留集它没见过，过题率正常。这正是污染在分数上的指纹。
 */
function stubRun(
  task: TaskWithCanary,
  memorized: Set<string>,
  rng: () => number,
): { passed: boolean; output: string } {
  const oracle = task.oracle?.expectedFinalState as
    | { config: Record<string, { 'db.pool.max': Range }> }
    | undefined;
  const svc = Object.keys(oracle?.config ?? {})[0];
  const range = oracle?.config?.[svc]?.['db.pool.max'];

  let chosen: number;
  let output: string;
  if (memorized.has(task.id) && range) {
    // 背过：直接落到区间正中，必过；并在输出里"漏出" canary（模拟训练数据回吐）
    chosen = Math.round((range.gte + range.lte) / 2);
    output = `已将 ${svc} 的 db.pool.max 调整为 ${chosen}。${task.canary}`;
  } else if (range) {
    // 没背过：按一定能力随机处置，约 75% 落在区间内
    const ok = rng() < 0.75;
    chosen = ok ? Math.round((range.gte + range.lte) / 2) : range.gte - 5;
    output = `已将 ${svc} 的 db.pool.max 调整为 ${chosen}。`;
  } else {
    chosen = 0;
    output = '未识别任务';
  }
  const passed = !!range && chosen >= range.gte && chosen <= range.lte;
  return { passed, output };
}

function scoreSet(
  tasks: TaskWithCanary[],
  memorized: Set<string>,
  rng: () => number,
): { score: SuiteScore; leakedCanaries: string[] } {
  let passed = 0;
  const known = tasks.map((t) => t.canary);
  const leaked = new Set<string>();
  for (const t of tasks) {
    const { passed: ok, output } = stubRun(t, memorized, rng);
    if (ok) passed++;
    for (const c of probeContamination(output, known)) leaked.add(c);
  }
  return { score: { passed, total: tasks.length }, leakedCanaries: [...leaked] };
}

function runScenario(label: string, contaminate: boolean) {
  // 固定种子 → 可复现。样本量要够大，污染判定的显著性检验才有功效
  const suite = generatePoolSuite(100, seededRng(42));
  const withC = injectCanaries(suite);
  const { publicSet, heldOut } = splitSuite(withC, 0.4);

  // 构造记忆集：被污染场景下，agent 背过"公开集里所有题"的答案
  const memorized = new Set<string>(contaminate ? publicSet.map((t) => t.id) : []);

  const pub = scoreSet(publicSet as TaskWithCanary[], memorized, seededRng(7));
  const held = scoreSet(heldOut as TaskWithCanary[], memorized, seededRng(7));

  const verdict = judgeContamination(pub.score, held.score, { minDiff: 0.05, alpha: 0.05 });

  console.log(`\n=== 场景：${label} ===`);
  console.log(`公开集 ${publicSet.length} 题，保留集 ${heldOut.length} 题`);
  console.log(`公开集通过率 ${verdict.publicRate.toFixed(3)}，保留集通过率 ${verdict.heldOutRate.toFixed(3)}`);
  console.log(`canary 探针：公开集漏出 ${pub.leakedCanaries.length} 个，保留集漏出 ${held.leakedCanaries.length} 个`);
  console.log(`判定：${verdict.contaminated ? '★ 疑似污染' : '√ 分数可信'}`);
  console.log(`理由：${verdict.reason}`);
}

function main() {
  console.log('第 6 章配套：任务集构建与防污染流程演示');
  console.log('（生成式任务 → canary 注入 → 公开集/保留集切分 → 污染判定）');
  runScenario('未污染（公开集与保留集同分布）', false);
  runScenario('被污染（agent 背过公开集答案）', true);
  console.log('\n说明：被污染场景里，公开集通过率被"背答案"抬高，');
  console.log('且 canary 在公开集输出中被漏出——双重信号坐实污染。');
}

main();
