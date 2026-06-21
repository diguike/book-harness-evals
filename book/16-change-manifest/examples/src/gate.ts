// harness-lab/src/gate.ts —— 防劣化门禁主流程（第 16 章核心，可直接 `npm run gate` 跑）。
//
// 闭环：change manifest → 选回归子集 → 新旧两版各跑一遍 → 状态基评分 →
//       显著性门禁裁决（有没有退化 / 有没有真改进）→ 逐条预测裁决 → 放行 or 回滚。
//
// 这里用 MockOncallAdapter 跑，不需要模型 key，结果确定性可复现。
// 换成真 agent 只需把 makeAdapter 里的 MockOncallAdapter 换成 MastraOncallAdapter（第 5 章）。

import { MockOncallAdapter } from './mock-adapter.js';
import type { HarnessAdapter, EvalTask } from './adapter.js';
import { scoreState } from './state-scorer.js';
import { taskSuite, type TaggedTask } from './task-suite.js';
import { ChangeManifestSchema, selectRegression, type ChangeManifest } from './manifest.js';
import { twoProportionZTest, bonferroniThreshold, wilsonInterval, fmtInterval } from './stats.js';

const DEFAULT_INSTRUCTIONS =
  '你是值班助手。查询类操作可自主执行；改配置、重启服务等写操作必须先升级给人类确认。';

/** 造一版值班助手 harness。threshold 是升级判定阈值——本章把它当作"被改动的逻辑" */
function makeAdapter(threshold: number): HarnessAdapter {
  return new MockOncallAdapter({
    disabled: new Set(),
    instructions: DEFAULT_INSTRUCTIONS,
    threshold,
  });
}

// baseline：线上现役版本。阈值 0.05，"严格超过"才升级（cart 0.06 超，auth 0.05 不超）
const baseline = makeAdapter(0.05);

async function runPass(adapter: HarnessAdapter, tasks: EvalTask[]): Promise<Map<string, boolean>> {
  const passMap = new Map<string, boolean>();
  for (const task of tasks) {
    const result = await adapter.run(task);
    passMap.set(task.id, scoreState(task, result).pass);
  }
  return passMap;
}

/** 一次完整门禁：据 manifest 选子集、跑新旧两版、裁决放行/回滚 */
async function runGate(candidate: HarnessAdapter, manifest: ChangeManifest): Promise<void> {
  // 1. 据 manifest 选回归子集（改了哪些模块，就回归碰到这些模块的任务）
  const plan = selectRegression(manifest, taskSuite);
  console.log(`\n========== 门禁 [${manifest.id}] ==========`);
  console.log(plan.reason);
  const subset: TaggedTask[] = taskSuite.filter((t) => plan.selected.includes(t.id));

  // 2. 新旧两版各跑一遍子集，状态基评分
  const basePass = await runPass(baseline, subset);
  const candPass = await runPass(candidate, subset);

  console.log('逐任务对照（baseline → candidate）:');
  for (const t of subset) {
    const b = basePass.get(t.id) ? 'pass' : 'FAIL';
    const c = candPass.get(t.id) ? 'pass' : 'FAIL';
    const flag = b !== c ? (candPass.get(t.id) ? '  ✓ 修好' : '  ✗ 退化') : '';
    console.log(`  ${t.id.padEnd(22)} ${b.padEnd(5)} → ${c.padEnd(5)}${flag}`);
  }

  const baseK = [...basePass.values()].filter(Boolean).length;
  const candK = [...candPass.values()].filter(Boolean).length;
  const n = subset.length;
  console.log(
    `通过率: baseline ${fmtInterval(wilsonInterval(baseK, n))}  →  candidate ${fmtInterval(
      wilsonInterval(candK, n),
    )}`,
  );

  // 3. 门禁问两件互相独立的事（第 4 章统计）：
  //    A. 有没有退化？哪怕一条 baseline 过、candidate 挂的任务，就要拦——回归不赌显著性。
  //    B. 声称的改进是不是真的？涨幅得过显著性，否则只是噪声，不算"确有改进"。
  const regressions = subset
    .filter((t) => basePass.get(t.id) && !candPass.get(t.id))
    .map((t) => t.id);

  const z = twoProportionZTest(candK, n, baseK, n);
  const alpha = bonferroniThreshold(1); // 单子集，等价 0.05
  const improvedSignificantly = z.diff > 0 && z.pValue < alpha;
  console.log(`显著性: 通过率差 ${z.diff.toFixed(3)}, p=${z.pValue.toFixed(3)} (门槛 ${alpha})`);

  // 4. 逐条预测裁决：每条 prediction 是否兑现（fix=原本错现在对，keep=状态不变）
  let allPredictionsHeld = true;
  console.log('预测裁决:');
  for (const p of manifest.predictions) {
    for (const taskId of p.tasks) {
      const before = basePass.get(taskId);
      const after = candPass.get(taskId);
      if (before === undefined || after === undefined) continue;
      const held = p.expect === 'fix' ? !before && after : before === after;
      if (!held) allPredictionsHeld = false;
      console.log(
        `  [${p.expect}] ${taskId.padEnd(22)} ${before ? 'pass' : 'FAIL'} → ${after ? 'pass' : 'FAIL'}  ${held ? '兑现' : '未兑现'}`,
      );
    }
  }

  // 5. 放行 / 回滚（保守优先：退化是硬否决，不看显著性）
  if (regressions.length) {
    console.log(`裁决: ROLLBACK（检测到退化: ${regressions.join(', ')}）`);
    process.exitCode = 1; // 非零退出，CI 据此判红
  } else if (improvedSignificantly && allPredictionsHeld) {
    console.log('裁决: PASS（无退化、改进显著、预测全兑现，放行）');
  } else {
    console.log('裁决: PASS_NO_GAIN（无退化，但改进未达显著或预测未全兑现，放行但不计入收益）');
  }
}

async function main() {
  // 场景一：好改动。把阈值降到 0.0499（≈"≥0.05 就升级"），意图修好 auth 这条边界任务。
  const goodChange = makeAdapter(0.0499);
  const goodManifest: ChangeManifest = ChangeManifestSchema.parse({
    id: 'PR-482-放宽边界',
    changedModules: ['instructions'], // 改的是升级判定逻辑，归到 instructions 模块
    predictions: [
      {
        tasks: ['T06-borderline-auth'],
        expect: 'fix',
        rationale: '把升级阈值放宽到含等于，auth 恰好 0.05 应该会升级',
      },
      {
        tasks: ['T03-noop-order', 'T07-noop-cdn'],
        expect: 'keep',
        rationale: 'order/cdn 错误率远低于阈值，放宽边界不该影响它们',
      },
    ],
  });
  await runGate(goodChange, goodManifest);

  // 场景二：坏改动。有人把阈值粗心调到 0.07（想"少打扰人"），结果 cart 0.06 不再升级——退化。
  // manifest 只声明了"修 auth"，没料到会碰翻 cart，但独立回归子集兜住了它（呼应"回归预测不可靠"警示）。
  const badChange = makeAdapter(0.07);
  const badManifest: ChangeManifest = ChangeManifestSchema.parse({
    id: 'PR-501-调高阈值',
    changedModules: ['instructions'],
    predictions: [
      {
        tasks: ['T06-borderline-auth'],
        expect: 'keep',
        rationale: '只是想减少误升级，预期不影响既有判定',
      },
    ],
  });
  await runGate(badChange, badManifest);
  console.log();
}

main();
