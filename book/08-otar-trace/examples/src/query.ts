import type { OtarNode } from './otar.js';

/**
 * 从某个节点出发，沿 causedBy 反向回溯，输出完整因果链（拓扑序：上游在前）。
 * 回答「这一步为什么会发生」。
 */
export function causalChain(nodes: OtarNode[], targetId: string): OtarNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: OtarNode[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return; // DAG 可能多路径汇聚，去重
    seen.add(id);
    const node = byId.get(id);
    if (!node) return;
    for (const up of node.causedBy) walk(up); // 先回溯上游，保证拓扑序
    chain.push(node);
  };
  walk(targetId);
  return chain;
}

/**
 * 找出没有被任何 thought 节点的 causedBy 引用过的 observation。
 * 这些是「按因果规则未被采纳」的观察，是误判最高发的来源（如本章的矛盾证据 O2）。
 *
 * 注意边界：这里逮到的是「未被采纳」，不等于「模型客观上没看到」。
 * 模型可能看到了却想错了 —— 那种情况该 observation 会进 causedBy、不会被本函数逮到。
 */
export function unconsumedObservations(nodes: OtarNode[]): OtarNode[] {
  const consumed = new Set<string>();
  for (const n of nodes) {
    if (n.kind === 'thought') n.causedBy.forEach((id) => consumed.add(id));
  }
  return nodes.filter((n) => n.kind === 'observation' && !consumed.has(n.id));
}
