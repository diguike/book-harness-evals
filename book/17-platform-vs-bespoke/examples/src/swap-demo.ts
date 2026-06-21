// 证明"换业务只换业务层、platform/ 一行不动"：
// 同一个 runSuite 引擎，先喂值班业务，再喂退款业务，两次都跑通

import { runSuite, type SuiteReport } from './platform/scoring.js';
import { StubOncallAdapter } from './oncall/adapter.js';
import { oncallTasks } from './oncall/tasks.js';
import { oncallEscalationPolicy } from './oncall/policy.js';
import {
  RefundStubAdapter,
  refundTasks,
  refundEscalationPolicy,
} from './refund/business.js';

function print(label: string, r: SuiteReport) {
  console.log(
    `[${label}] harness=${r.harness} pass=${(r.passRate.point * 100).toFixed(0)}% Ask-F1=${r.askF1.f1.toFixed(2)}`,
  );
}

async function main() {
  // 业务一：值班助手
  const oncall = await runSuite({
    adapter: new StubOncallAdapter(),
    tasks: oncallTasks,
    escalationPolicy: oncallEscalationPolicy,
  });
  print('值班', oncall);

  // 业务二：退款助手。换的只是 adapter / tasks / policy 这三个业务对象，
  // runSuite、wilsonInterval、Ask-F1 这些 platform/ 里的东西一行没动。
  const refund = await runSuite({
    adapter: new RefundStubAdapter(),
    tasks: refundTasks,
    escalationPolicy: refundEscalationPolicy,
  });
  print('退款', refund);

  console.log('\n两个业务复用了同一份 platform/ 评测引擎，platform/ 一行没改。');
}

main();
