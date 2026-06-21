// 组装：平台引擎（platform/）+ 业务钩子（oncall/）→ 一个能跑的评测系统
// 体会正文那条线：业务把数据/策略/adapter 注入接口，平台引擎一行业务代码都没有

import { runSuite } from './platform/scoring.js';
import { StubOncallAdapter } from './oncall/adapter.js';
import { oncallTasks } from './oncall/tasks.js';
import { oncallEscalationPolicy } from './oncall/policy.js';

async function main() {
  const report = await runSuite({
    adapter: new StubOncallAdapter(), // 业务：接 Mastra 的 adapter
    tasks: oncallTasks, // 业务：任务集
    escalationPolicy: oncallEscalationPolicy, // 业务：升级策略钩子
    // successPolicy 不传 → 用平台默认口径（超时一律算 fail）
  });

  console.log('== 值班助手评测报告（平台引擎 + 业务钩子）==');
  console.log(`harness: ${report.harness}  任务数: ${report.total}`);
  const p = report.passRate;
  console.log(
    `通过率: ${(p.point * 100).toFixed(0)}%  [Wilson 95% CI ${(p.lower * 100).toFixed(0)}% ~ ${(p.upper * 100).toFixed(0)}%]`,
  );
  const f = report.askF1;
  console.log(
    `Ask-F1: P=${f.precision.toFixed(2)} R=${f.recall.toFixed(2)} F1=${f.f1.toFixed(2)}`,
  );
  console.log(`总 tokens: ${report.costTokens}`);
}

main();
