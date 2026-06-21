/**
 * OTAR 节点结构 + 因果链回溯。
 *
 * 下面的 OtarNode 是 writing-kit §4 canonical OtarNode 的就近副本，字段逐字相同、非简化版
 * （第 8 章定义，见 08-otar-trace/examples/src/otar.ts 与 query.ts）。
 * 本章为了让示例工程能独立 `npm i && npm start`，把它和 causalChain 这两段最小定义就近放在这里。
 * 真实项目里应直接 import 第 8 章的实现，不要各拷一份。
 */

export interface OtarNode {
  id: string;
  kind: 'observation' | 'thought' | 'action' | 'result';
  content: unknown;
  causedBy: string[]; // 上游节点 id，构成因果链（因果方向，不是时间方向）
  module?: string; // 由哪个 harness 模块产生（第 9–11 章归因用）
  ts: number;
}

/**
 * 从某个节点出发，沿 causedBy 反向回溯，输出完整因果链（拓扑序：上游在前）。
 * 第 11 章用它对失败动作回溯，得到候选病灶集，并据拓扑序取「最上游」翻转点为根因。
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
