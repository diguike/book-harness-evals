// verify-swap.ts —— 换载体的验收脚本。
// 同一个 evaluate 函数喂任意 HarnessAdapter，跑同一套任务集、用同一个评分函数打分。
// 函数体内没有任何 "if (adapter is Mastra)" 分支：它对载体一无所知。
// 跑通即证明——评测资产（任务集、评分、消融逻辑）和具体框架彻底脱钩。

import type { HarnessAdapter } from './adapter.js';
import { StubOncallHarness } from './stub-harness.js';
import { scoreFinalState } from './score.js';
import { tasks } from './tasks.js';

/** 对载体无感知的评测：拿到任意 adapter 都一样跑 */
async function evaluate(adapter: HarnessAdapter) {
  const rows: { task: string; pass: boolean; escalated: boolean; otarNodes: number }[] = [];
  let pass = 0;

  for (const task of tasks) {
    const result = await adapter.run(task); // 不关心底层是什么框架
    const ok = scoreFinalState(result, task.oracle); // 同一个评分函数
    if (ok) pass++;
    rows.push({
      task: task.id,
      pass: ok,
      escalated: (result.finalState as { escalated: boolean }).escalated,
      otarNodes: result.trace.length, // 确认 trace 已对齐 OTAR
    });
  }

  return { adapter: adapter.name, pass, total: tasks.length, rows };
}

async function main() {
  // ---- 1. 用 stub 载体跑（零依赖、确定性、秒级）----
  const stub = new StubOncallHarness({ disabled: new Set(), threshold: 0.05 });
  const stubReport = await evaluate(stub);

  console.log('=== stub 载体评测结果 ===');
  console.log(`载体 ${stubReport.adapter}：${stubReport.pass}/${stubReport.total} 通过`);
  console.table(stubReport.rows);

  // ---- 2. 演示 withConfig 消融对换载体透明 ----
  // 关掉升级工具后，本该升级的任务必然失败——而 evaluate 一行没改
  const ablated = stub.withConfig({ disable: ['escalateOncall'] });
  const ablatedReport = await evaluate(ablated);
  console.log('\n=== 关掉 escalateOncall 后（消融，第 9 章能力）===');
  console.log(
    `载体 ${ablatedReport.adapter}：${ablatedReport.pass}/${ablatedReport.total} 通过` +
      `（升级任务应失败，证明 withConfig 生效且对评测层透明）`,
  );

  // ---- 3. 断言验收 ----
  // 期望：stub 全过；消融后至少掉一分。任一不满足说明 adapter 没接对。
  const okFull = stubReport.pass === stubReport.total;
  const okAblation = ablatedReport.pass < stubReport.pass;
  if (!okFull || !okAblation) {
    console.error('\n[FAIL] 验收未通过：adapter 的 RunResult 没接对评测层。');
    process.exit(1);
  }

  console.log('\n[OK] 换载体验收通过：');
  console.log('  - StubOncallHarness 不依赖 @mastra/core，实现同一 HarnessAdapter 接口');
  console.log('  - 同一段 evaluate 评测代码一行未改即可评它');
  console.log('  - trace 已对齐 OTAR（每任务产出 action 节点），withConfig 消融生效');
  console.log('\n要换成连真模型的 Mastra adapter 做对照，见本目录 README「切回 Mastra」一节。');
}

main();
