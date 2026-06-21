import { FAILED_TRACE, FAILING_ACTION_ID } from './fixture.js';
import { locateRootCause } from './locate.js';
import { makeStubRerun } from './rerun-stub.js';

/**
 * 入口：用确定性桩重跑器，对「查对服务、改错字段」的失败 trace 做反事实根因定位。
 * 无需 API key。要跑真模型版见 src/rerun-mastra.ts（npm run start:mastra）。
 */
async function main() {
  const rerun = makeStubRerun(7);
  const result = await locateRootCause(FAILED_TRACE, FAILING_ACTION_ID, rerun, {
    repeats: 5,
    flipThreshold: 0.6,
  });

  const chainStr = result.suspects.map((n) => n.id).join(' → ');
  console.log(`候选病灶（失败动作 ${FAILING_ACTION_ID} 的因果链）：${chainStr}`);
  console.log('逐个单点干预重跑（每个重复 5 次）：');

  const label: Record<string, string> = {
    O1: 'O1 查日志 ',
    T1: 'T1 推理   ',
    O2: 'O2 查监控 ',
    O3: 'O3 搜手册 ',
    T2: 'T2 推理   ',
  };
  for (const v of result.verdicts) {
    const tag = v.isFlip ? '→ 翻转点' : '→ 旁证';
    const name = label[v.node.id] ?? v.node.id;
    console.log(
      `  ${name} ${v.intervention.kind.padEnd(10)} 翻转率 ${v.flippedTimes}/${v.repeats}  ${tag}`,
    );
  }

  console.log(`翻转点 ${result.flips.length} 个；取因果链最上游者：${result.rootCause?.id ?? '无（可能多步耦合）'}`);

  if (result.rootCause) {
    const rc = result.rootCause;
    console.log(`根因 = ${rc.id}：${describeRootCause(rc.id)}`);
    console.log('修复方向：修正该手册或为其加前置条件（→ 第 16 章 change manifest）');
  } else {
    console.log('未找到单点翻转：这次失败可能是多步耦合，回到第 9–10 章做模块级归因（正文诚实边界第三条）');
  }
}

function describeRootCause(id: string): string {
  if (id === 'O3') return '《连接池打满的应急处理》在内存敏感实例上给出错误建议';
  return '见 trace 节点 content';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
