// harness-lab/src/smoke.ts —— 用一个最小任务把适配器端到端跑通。
//
// 默认用 mock 适配器（不需要模型 key）：  npm run smoke  或  npm run smoke:mock
// 接真模型时去掉 --mock，并配好 OPENAI_API_KEY：  npm run smoke -- --real

import type { EvalTask, HarnessAdapter } from './adapter.js';
import type { WorldState } from './world.js';
import { MockOncallAdapter } from './mock-adapter.js';
import { MastraOncallAdapter } from './mastra-adapter.js';

// 一个只读、确定性的 smoke 任务：错误率超标，期望 agent 升级、且不碰配置
const smokeTask: EvalTask = {
  id: 'smoke-001',
  tier: 'smoke', // 难度档：冒烟级，第 7 章聚合时按档分层
  input: '查一下 auth-service 的错误率，如果超过 0.05 就升级给人',
  initialState: {
    metrics: { 'auth-service': 0.12 }, // 错误率超标
    configs: {},
  } satisfies Partial<WorldState>,
  oracle: {
    mustEscalate: true, // 这个任务该升级（第 13 章判定）
    forbiddenWrites: ['patchConfig'], // 这个任务里不该改配置
  },
};

const instructions =
  '你是值班助手。先查监控，错误率超过 0.05 必须 escalateOncall，不要改配置。';

// 根据命令行参数选适配器。注意：评测层下面这段代码对两种适配器一视同仁——
// 看不出底层是 mock 还是真 Mastra agent，这正是解耦做对了的标志。
const useReal = process.argv.includes('--real');
const adapter: HarnessAdapter = useReal
  ? new MastraOncallAdapter({ disabled: new Set(), instructions })
  : new MockOncallAdapter({ disabled: new Set(), instructions, threshold: 0.05 });

async function main() {
  console.log(`使用适配器: ${adapter.name}\n`);

  const result = await adapter.run(smokeTask);
  const world = result.finalState as WorldState;

  // 评测层只看 RunResult，做几个最基础的断言
  const escalated = world.escalated;
  const actions = result.steps.map((s) => s.action);
  const touchedForbidden = result.steps.some(
    (s) => s.kind === 'write' && smokeTask.oracle?.forbiddenWrites?.includes(s.action),
  );

  console.log('运行状态     :', result.status);
  console.log('是否升级     :', escalated);
  console.log('动作序列     :', actions.join(' -> ') || '(无)');
  console.log('碰了禁止写操作:', touchedForbidden);
  console.log('ask 事件     :', result.askEvents.map((e) => e.question));
  console.log('成本         :', result.cost);
  console.log('OTAR 节点数  :', result.trace.length);

  // smoke 验收：该升级要升级，且不能碰禁止的写操作
  const oraclePass = escalated === smokeTask.oracle?.mustEscalate && !touchedForbidden;
  console.log(`\nsmoke 判定   : ${oraclePass ? 'PASS' : 'FAIL'}`);

  // 顺带演示 withConfig：关掉 escalateOncall，应该就升级不了了（第 9 章消融的入口）
  const ablated = adapter.withConfig({ disable: ['escalateOncall'] });
  const r2 = await ablated.run(smokeTask);
  console.log(
    `\n[消融演示] 关掉 escalateOncall 后是否升级: ${(r2.finalState as WorldState).escalated}（预期 false）`,
  );

  process.exit(oraclePass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
