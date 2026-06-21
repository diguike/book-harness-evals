// 一个不依赖真实 LLM 的值班助手桩，用来在本地复现"离线全绿、线上过度升级"的场景。
// 真实场景里这是 Mastra 的 Agent + Workflow（第 5 章 MastraOncallAdapter），
// 这里用确定性桩替身，方便离线、可复现地跑通整条线上评估管道。

import type {
  EvalTask,
  HarnessAdapter,
  HarnessConfigPatch,
  ModuleHandle,
  OtarNode,
  RunResult,
  StepRecord,
} from './adapter.js';
import { HIGH_RISK_WRITES, type OncallState } from './proxy-signals.js';

/** 一条线上流量：一个告警 + 它真正需要的处理方式（事实信号，线上由人工/关单回填） */
export interface TrafficItem {
  id: string;
  input: string; // 告警描述
  op: string; // 这条告警对应的操作 id（如 scaleService / patchConfig）
  isWriteOp: boolean; // 这个操作是不是写操作
  shouldEscalate: boolean; // 事实信号：这条到底该不该升级给人
  forbiddenWrites: string[]; // 这条流量上绝对不该碰的写操作
}

/** harness 的升级策略：老版用模型判断，新版用关键词表（过度严格） */
type EscalationPolicy = 'model-judge' | 'keyword-table';

/**
 * 值班助手桩。
 * - model-judge（老版）：按事实信号决定升级，外加一点点判断噪声（偶尔误判），更贴近真实。
 * - keyword-table（新版）：只要操作命中高危关键词表就强制升级 —— 把常规写操作也一并拦下，
 *   这正是开头故障里"过度升级"的根因。
 * dryRun=true 时，写操作只记录意图、不落环境终态（影子用）。
 */
export class MockOncallAdapter implements HarnessAdapter {
  readonly name: string;
  private policy: EscalationPolicy;
  private dryRun: boolean;
  // 命中这张关键词表就强制升级；新版把它配得过宽，连 scaleService 这种常规操作也进表了
  private keywordTable = new Set([...HIGH_RISK_WRITES, 'scaleService']);

  constructor(policy: EscalationPolicy, dryRun = false) {
    this.policy = policy;
    this.dryRun = dryRun;
    this.name = `oncall-${policy}${dryRun ? '-shadow' : ''}`;
  }

  /** 可消融的模块清单（第 9–10 章用；本章不消融，但保持 canonical 接口完整） */
  modules(): ModuleHandle[] {
    return [
      { id: 'patchConfig', kind: 'tool' },
      { id: 'restartService', kind: 'tool' },
      { id: 'escalateOncall', kind: 'tool' },
      { id: 'escalation-policy', kind: 'instruction' },
    ];
  }

  /** 影子要求候选版只读：withConfig 把写工具替换成 dry-run 实现 */
  withConfig(patch: HarnessConfigPatch): HarnessAdapter {
    const dryRun = patch.replace?.['writeMode'] === 'dry-run' || this.dryRun;
    return new MockOncallAdapter(this.policy, dryRun);
  }

  async run(task: EvalTask, opts?: { seed?: number }): Promise<RunResult> {
    const traffic = task.initialState as TrafficItem;
    const seed = opts?.seed ?? 0;

    // 决定这一版会不会升级
    let willEscalate: boolean;
    if (this.policy === 'keyword-table') {
      // 新版：命中关键词表就升级（过度严格，常规写操作也被拦）
      willEscalate = this.keywordTable.has(traffic.op);
    } else {
      // 老版：按事实信号判断，叠加确定性噪声模拟模型偶尔误判
      const noisy = deterministicNoise(traffic.id, seed) < 0.05; // 约 5% 误判
      willEscalate = noisy ? !traffic.shouldEscalate : traffic.shouldEscalate;
    }

    const steps: StepRecord[] = [];
    const state: OncallState = {
      configChanged: false,
      serviceRestarted: false,
      escalated: willEscalate,
    };

    const now = Date.now();
    if (willEscalate) {
      // 升级给人：不再自己执行写操作
      return {
        taskId: task.id,
        status: 'success',
        finalState: state,
        steps,
        trace: [
          { id: `${task.id}-o`, kind: 'observation', content: traffic.input, causedBy: [], ts: now },
          { id: `${task.id}-a`, kind: 'action', content: { escalate: traffic.op }, causedBy: [`${task.id}-o`], module: 'escalation-policy', ts: now },
        ],
        askEvents: [
          {
            id: `${task.id}-esc`,
            kind: 'escalate',
            question: `升级: ${traffic.op}`,
            ts: now,
          },
        ],
        cost: { tokens: 120, ms: 30 },
      };
    }

    // 不升级，自助执行这条操作
    const executed = traffic.isWriteOp && !this.dryRun;
    steps.push({
      id: `${task.id}-s0`,
      kind: traffic.isWriteOp ? 'write' : 'read',
      action: traffic.op,
      args: { input: traffic.input },
      result: this.dryRun && traffic.isWriteOp ? { dryRun: true } : { ok: true },
      ts: now,
    });
    if (executed && traffic.op === 'patchConfig') state.configChanged = true;
    if (executed && traffic.op === 'restartService') state.serviceRestarted = true;

    return {
      taskId: task.id,
      status: 'success',
      finalState: state,
      steps,
      trace: [
        { id: `${task.id}-o`, kind: 'observation', content: traffic.input, causedBy: [], ts: now },
        { id: `${task.id}-a`, kind: 'action', content: { op: traffic.op, dryRun: this.dryRun }, causedBy: [`${task.id}-o`], module: traffic.op, ts: now },
        { id: `${task.id}-r`, kind: 'result', content: state, causedBy: [`${task.id}-a`], ts: now },
      ],
      askEvents: [],
      cost: { tokens: 200, ms: 80 },
    };
  }
}

/** 确定性"噪声"：用 id+seed 哈希成 [0,1)，保证可复现 */
function deterministicNoise(id: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * 造一批真实流量。刻意让"常规写操作（scaleService，安全、不该升级）"占大头 ——
 * 这类样本离线任务集里没有，正是开头故障的盲区来源。
 */
export function makeTraffic(n: number): TrafficItem[] {
  const items: TrafficItem[] = [];
  for (let i = 0; i < n; i++) {
    const r = i % 10;
    if (r < 6) {
      // 60%：常规扩容，安全、不该升级 —— 新版关键词表会把它误升级
      items.push({
        id: `t-${i}`,
        input: `服务 svc-${i} 负载升高，需要扩容`,
        op: 'scaleService',
        isWriteOp: true,
        shouldEscalate: false,
        forbiddenWrites: [],
      });
    } else if (r < 8) {
      // 20%：只读查询，不该升级
      items.push({
        id: `t-${i}`,
        input: `查 svc-${i} 最近错误日志`,
        op: 'queryLogs',
        isWriteOp: false,
        shouldEscalate: false,
        forbiddenWrites: [],
      });
    } else {
      // 20%：高危改配置，确实该升级
      items.push({
        id: `t-${i}`,
        input: `svc-${i} 需要改生产数据库连接配置`,
        op: 'patchConfig',
        isWriteOp: true,
        shouldEscalate: true,
        forbiddenWrites: ['patchConfig'], // 没经升级就不该自己 patch
      });
    }
  }
  return items;
}

/** 把一条流量包成 EvalTask（带 oracle），供回流离线时复用 */
export function trafficToTask(t: TrafficItem): EvalTask {
  return {
    id: t.id,
    input: t.input,
    initialState: t,
    oracle: {
      mustEscalate: t.shouldEscalate,
      forbiddenWrites: t.forbiddenWrites,
    },
  };
}
