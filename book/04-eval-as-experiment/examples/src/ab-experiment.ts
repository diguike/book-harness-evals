import {
  wilsonInterval,
  sampleSizePerGroup,
  twoProportionZTest,
} from './stats.js';

// 把本章的统计工具串成一次完整的 A/B 评测实验，按正文那张 flowchart 的顺序走：
//   定 MDE → 算样本量 → 固定随机源 → 两版各跑任务集 → Wilson 区间 → 显著性检验 → 报分带区间
//
// 这里用一个内存桩模拟第 5 章会正式定义的 HarnessAdapter：
//   run(task, { seed }) => 这条任务过没过
// 第 5 章会把它换成真的 MastraOncallAdapter，本章先用桩跑通流程。

// ---- 极简版 EvalTask（字段对齐第 5 章 §4 的 adapter 接口，这里只保留够用的部分）----
interface EvalTask {
  id: string;
}

// ---- 一个可复现的伪随机数发生器：固定 seed 就固定整条随机序列 ----
// 对应正文"做对照前固定所有能固定的随机源"，也对应 adapter 的 { seed } 参数。
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 内存桩 adapter：给定真实通过率，可复现地判定每条任务过没过 ----
// 真实通过率 trueRate 是"上帝视角"的设定值，评测的目标就是从有限样本里把它估出来。
function makeStubAdapter(trueRate: number) {
  return {
    run(task: EvalTask, opts: { seed: number }): boolean {
      // 用 seed + 任务 id 派生确定性随机：同一 (seed, task) 永远得到同一结果
      const rng = mulberry32(opts.seed ^ hashCode(task.id));
      return rng() < trueRate;
    },
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// 跑一版 harness 在整个任务集上，返回过了多少条
function runSuite(
  adapter: { run(t: EvalTask, o: { seed: number }): boolean },
  tasks: EvalTask[],
  seed: number,
): number {
  let passed = 0;
  for (const task of tasks) if (adapter.run(task, { seed })) passed++;
  return passed;
}

function pct(x: number): string {
  return (x * 100).toFixed(1) + '%';
}

function main() {
  // 步骤 1：先想清楚要分辨多小的差距（MDE），据此估样本量
  const baseline = 0.8;
  const mde = 0.05;
  console.log('=== 一次 A/B 评测实验 ===\n');
  console.log(
    `想在基线 ${pct(baseline)} 上稳稳检测出 +${pct(mde)} 的提升，` +
      `每组约需 ${sampleSizePerGroup(baseline, mde)} 条任务。`,
  );

  // 现实里手头往往只有这么多任务——故意用一个小评测集，看看会发生什么
  const n = 50;
  const tasks: EvalTask[] = Array.from({ length: n }, (_, i) => ({
    id: `task-${i}`,
  }));
  console.log(`手头只有 ${n} 条任务，先认清它配下多大的结论。\n`);

  // 步骤 2：固定随机源（同一个 seed），让两版只差"真实通过率"这一个变量。
  // A 版真实通过率 0.80，B 版 0.82——只比 A 高 2 个百分点，这正是噪声量级。
  const seed = 42;
  const adapterA = makeStubAdapter(0.8);
  const adapterB = makeStubAdapter(0.82);

  const passA = runSuite(adapterA, tasks, seed);
  const passB = runSuite(adapterB, tasks, seed);

  const ciA = wilsonInterval(passA, n);
  const ciB = wilsonInterval(passB, n);

  // 步骤 3：报分必带区间
  console.log('A 版：' + `${passA}/${n} = ${pct(ciA.point)} ` +
    `(${pct(ciA.lower)}–${pct(ciA.upper)}, n=${n})`);
  console.log('B 版：' + `${passB}/${n} = ${pct(ciB.point)} ` +
    `(${pct(ciB.lower)}–${pct(ciB.upper)}, n=${n})`);

  // 步骤 4：显著性检验
  const test = twoProportionZTest(passA, n, passB, n);
  console.log(`\n双比例 z 检验：差 ${pct(test.diff)}，p 值 = ${test.pValue.toFixed(3)}`);

  if (test.pValue < 0.05) {
    console.log('→ p < 0.05：差异从噪声里分得出来。');
  } else {
    console.log(
      '→ p ≥ 0.05：没有证据表明两版有差别。即便 B 的点估计更高，也别下"B 更好"的结论。',
    );
  }
  console.log(
    '\n0.82 vs 0.84 这种差距，在小样本下统计上不成立，不能据此判定新版更好。',
  );
}

main();
