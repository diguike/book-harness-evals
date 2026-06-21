import { buildOtar } from './build-otar.js';
import { causalChain, unconsumedObservations } from './query.js';
import { failedRestartTrace, explicitDeps } from './fixture.js';
import type { OtarNode } from './otar.js';

function fmt(n: OtarNode): string {
  const tag = { observation: 'O 观察', thought: 'T 思考', action: 'A 动作', result: 'R 结果' }[n.kind];
  const mod = n.module ? ` [${n.module}]` : '';
  const content = typeof n.content === 'string' ? n.content : JSON.stringify(n.content);
  return `${n.id.padEnd(12)} ${tag}${mod}  ${content}`;
}

function main() {
  // 1) 把 Mastra trace 整理成 OTAR 因果 DAG
  //    explicitDeps 精确声明 T2 只依据了 O3，复现「模型漏看 O2」的真实病灶
  const otar = buildOtar(failedRestartTrace, { explicitDeps });

  console.log('=== OTAR 因果 DAG（节点 + causedBy 边）===\n');
  for (const n of otar) {
    const edges = n.causedBy.length ? `  ← causedBy: ${n.causedBy.join(', ')}` : '';
    console.log(fmt(n) + edges);
  }

  // 2) 查因果链：重启（A1）这一步为什么会发生？
  console.log('\n=== 查询 1：A1（重启）的因果链 ===\n');
  const chain = causalChain(otar, 'A1');
  console.log(chain.map((n) => n.id).join(' → '));
  console.log('解读：重启依据 O1/T1（日志指向 auth）+ O3（runbook），由 T2 拍板 —— 链里没有 O2。');

  // 3) 查矛盾证据：哪些观察产生了却没被任何思考采纳？
  console.log('\n=== 查询 2：未被采纳的观察（矛盾证据嫌疑）===\n');
  const orphans = unconsumedObservations(otar);
  for (const o of orphans) console.log(fmt(o));
  if (orphans.length) {
    console.log(
      '\n解读：O2（auth-service P99 正常）产生了却没进任何思考的 causedBy ——',
      '与「auth 是根因」直接矛盾的证据被漏看，这正是这次误重启的病根。',
    );
  }

  // 4) 边界提醒：要区分「没看到」与「看到了想错了」，得看 T2 的实际输出
  const t2 = otar.find((n) => n.id === 'T2');
  console.log('\n=== 边界：T2 思考节点的实际内容（供人判断是漏看还是想错）===\n');
  console.log(String(t2?.content));
}

main();
