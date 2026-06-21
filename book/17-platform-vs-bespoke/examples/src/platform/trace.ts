// 平台层 · 第 8 章 OTAR 结构化因果 trace（与业务无关）
// 完整实现见第 8 章 examples/08-otar-trace/；这里给收口包的接口占位。
// OtarNode 的权威定义在 adapter.ts（全书脊梁接口），这里只提供构建/查询工具。

import type { OtarNode } from './adapter.js';

export type { OtarNode };

/** 因果 DAG：节点集 + 由 causedBy 反推出的邻接关系 */
export interface OtarDag {
  nodes: OtarNode[];
  // childrenOf(id) → 直接由该节点导致的下游节点 id
  childrenOf(id: string): string[];
}

/**
 * 从一次 run 的 OtarNode[] 构建因果 DAG（第 8 章为第 11 章反事实 RCA 打基础）。
 * @param nodes 一次运行采集到的 O/T/A/R 节点，节点间已用 causedBy 串好上游
 */
export function buildDag(nodes: OtarNode[]): OtarDag {
  // TODO（第 8 章完整实现）：校验 causedBy 闭合、检测环、按 ts 拓扑排序。
  const childIndex = new Map<string, string[]>();
  for (const n of nodes) {
    for (const parent of n.causedBy) {
      const arr = childIndex.get(parent) ?? [];
      arr.push(n.id);
      childIndex.set(parent, arr);
    }
  }
  return {
    nodes,
    childrenOf: (id) => childIndex.get(id) ?? [],
  };
}
