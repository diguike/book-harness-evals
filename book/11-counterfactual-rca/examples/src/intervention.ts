import type { OtarNode } from './otar.js';

/**
 * 一次反事实干预：动 OTAR 图里的某个节点，怎么动。
 * 三种基本干预对应正文「反事实：把"如果当时换一步"变成一次可重跑的实验」。
 */
export interface Intervention {
  targetId: string; // 动哪个 OTAR 节点
  kind: 'ablate' | 'substitute' | 'mutate'; // 删除 / 替换输出 / 改参
  /** substitute 用：把该节点的输出替换成这个值 */
  substituteContent?: unknown;
  /** mutate 用：改这一步动作的参数 */
  mutateArgs?: Record<string, unknown>;
  /** 仅用于打印，便于人读 */
  note?: string;
}

/** 一次干预重跑后的裁决记录 */
export interface CounterfactualResult {
  node: OtarNode;
  intervention: Intervention;
  flippedTimes: number; // repeats 次里翻转了几次
  repeats: number;
  flipRate: number;
  isFlip: boolean; // 翻转率是否过阈值
}

/**
 * 按节点类型给一个默认干预方案（对应正文「在 OTAR 图上选谁来干预」）：
 *   - Observation：替换成一个「对照」输出（这里用一个标记，由 rerun 解释成"换个方向的观察"）
 *   - Thought：替换结论
 *   - Action：改参（把动作参数调温和）
 * 真实项目里 substituteContent / mutateArgs 应来自领域知识或对照数据集，
 * 这里给出能驱动桩重跑器演示翻转逻辑的最小方案。
 */
export function planIntervention(node: OtarNode): Intervention {
  switch (node.kind) {
    case 'observation':
      return {
        targetId: node.id,
        kind: 'substitute',
        substituteContent: { control: true }, // 标记：把这步观察换成对照输出
        note: '换成对照观察',
      };
    case 'thought':
      return {
        targetId: node.id,
        kind: 'substitute',
        substituteContent: { conclusion: 'investigate-slow-query' },
        note: '换成对照结论：先排查慢查询',
      };
    case 'action':
      return {
        targetId: node.id,
        kind: 'mutate',
        mutateArgs: { max_connections: 80 }, // 把激进改参调温和
        note: '改参：max_connections 200 → 80',
      };
    default:
      // result 节点不单独干预（它由 action 派生）
      return { targetId: node.id, kind: 'ablate', note: '删除' };
  }
}
