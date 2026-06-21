/**
 * OTAR 节点结构，全书统一（与 harness-lab/src/adapter.ts 中的声明保持一致）。
 * O/T/A/R 四类节点，用 causedBy 连成因果 DAG。
 */
export interface OtarNode {
  id: string;
  kind: 'observation' | 'thought' | 'action' | 'result';
  content: unknown;
  causedBy: string[]; // 上游节点 id，构成因果链（因果方向，不是时间方向）
  module?: string;    // 由哪个 harness 模块产生（第 9–11 章归因用）
  ts: number;
}
