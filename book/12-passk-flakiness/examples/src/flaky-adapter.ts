// 可注入抖动源的 mock adapter，复现本章开头那个故障：searchRunbook 召回顺序不稳，
// 导致值班助手偶发"先重启"而非"先升级"。不依赖任何模型 key，确定性可复现。
//
// 它实现第 5 章的 HarnessAdapter 接口，评测层读 RunResult 时分不出底层是真 agent 还是 mock。
// 真实评测把它换成 MastraOncallAdapter（基于 @mastra/core 的 Agent，model: 'openai/gpt-4.1'，
// 换成你实际在用的模型 id）。这里用确定性脚本替代模型决策，专门暴露"工具返回非确定"这一类抖动。

import type {
  AskEvent,
  EvalTask,
  HarnessAdapter,
  HarnessConfigPatch,
  ModuleHandle,
  RunResult,
  StepRecord,
} from './adapter.js';

/** 抖动源开关：用来做归因对照——逐一关掉某个随机源，看 flakiness 降不降 */
export interface FlakyConfig {
  deterministicRunbookOrder: boolean; // 第 2 类抖动：召回结果是否强制确定排序
  temperature: number; // 第 1 类抖动：>0 时模型决策带随机扰动（这里用 mock 模拟）
}

// 本章在公共 EvalTask 上扩展一个风险标签，用来决定重复次数 n（第 6 章构造任务集时打的标签）。
// 它是本章的本地扩展，不进 canonical adapter——评测层只认 EvalTask。
export interface StabilityTask extends EvalTask {
  risk?: 'read-only' | 'high-write';
}

/** 知识库里某服务的处置手册片段，每条带检索相关度分数 */
interface RunbookChunk {
  id: string;
  score: number; // 检索相关度
  directive: 'restart-first' | 'escalate-first'; // 这段手册指向的处置方向
}

// payment 服务的手册：两条片段相关度相同（都是 0.8），谁排前面决定模型先读到哪条。
// 这正是真实向量库对同分片段返回顺序不稳的还原。
const RUNBOOK: Record<string, RunbookChunk[]> = {
  payment: [
    { id: 'rb-restart', score: 0.8, directive: 'restart-first' },
    { id: 'rb-escalate', score: 0.8, directive: 'escalate-first' },
  ],
};

export class FlakyOncallAdapter implements HarnessAdapter {
  name = 'flaky-oncall';

  constructor(private config: FlakyConfig) {}

  async run(task: EvalTask, opts?: { seed?: number }): Promise<RunResult> {
    const t0 = Date.now();
    const seed = opts?.seed ?? 0;
    const steps: StepRecord[] = [];
    const service = pickService(task.input);
    const risk = (task as StabilityTask).risk; // 本章本地扩展字段，决定走只读分支还是处置分支

    // 只读任务（查日志 / 查监控，不触发处置分支）：行为完全确定，次次同样结果。
    // 用它当稳定对照——pass^k=1、flakiness=0，把抖动任务从聚合分里反衬出来。
    if (risk === 'read-only') {
      steps.push({ id: 's0', kind: 'read', action: 'queryLogs', args: { service }, result: { lines: 42 }, ts: t0 });
      return {
        taskId: task.id,
        status: 'success',
        finalState: { action: 'reported' },
        steps,
        trace: [],
        askEvents: [],
        cost: { tokens: steps.length * 120, ms: Date.now() - t0 },
      };
    }

    // 1) 查监控：错误率超阈值，进入处置分支
    steps.push({ id: 's0', kind: 'read', action: 'queryMetrics', args: { service }, result: { value: 0.12 }, ts: t0 });

    // 2) searchRunbook：召回手册片段。顺序是不是确定的，由 config 决定
    const chunks = retrieveRunbook(service, seed, this.config.deterministicRunbookOrder);
    steps.push({ id: 's1', kind: 'read', action: 'searchRunbook', args: { service }, result: chunks.map((c) => c.id), ts: t0 + 1 });

    // 3) 模型读召回上下文做决策。这里用确定性脚本模拟：读到的第一条片段决定方向。
    //    temperature>0 时再叠加一点随机扰动（模拟采样抖动，第 1 类来源）。
    const firstDirective = chunks[0]?.directive ?? 'escalate-first';
    const decision = decide(firstDirective, this.config.temperature, seed);

    let finalState: { action: string };
    const askEvents: AskEvent[] = [];
    if (decision === 'escalate') {
      steps.push({ id: 's2', kind: 'escalate', action: 'escalateOncall', args: { reason: `${service} 错误率超阈值` }, ts: t0 + 2 });
      finalState = { action: 'escalated' };
      askEvents.push({ id: 'a0', kind: 'escalate', question: `${service} 错误率超阈值，升级给人`, stepId: 's2', ts: t0 + 2 });
    } else {
      // 自己重启——本章故障里这是错误处置（该升级却自作主张）
      steps.push({ id: 's2', kind: 'write', action: 'restartService', args: { service }, ts: t0 + 2 });
      finalState = { action: 'restarted' };
    }

    return {
      taskId: task.id,
      status: 'success', // 成功与否由评测层比对 finalState 与 oracle 判定，不在这里下结论
      finalState,
      steps,
      trace: [],
      askEvents,
      cost: { tokens: steps.length * 120, ms: Date.now() - t0 },
    };
  }

  modules(): ModuleHandle[] {
    return [
      { id: 'queryMetrics', kind: 'tool' },
      { id: 'searchRunbook', kind: 'tool' },
      { id: 'escalateOncall', kind: 'tool' },
      { id: 'restartService', kind: 'tool' },
    ];
  }

  withConfig(patch: HarnessConfigPatch): HarnessAdapter {
    // 用 replace 注入抖动源开关：replace.deterministicRunbookOrder / replace.temperature
    const next: FlakyConfig = { ...this.config };
    const r = patch.replace ?? {};
    if (typeof r.deterministicRunbookOrder === 'boolean') next.deterministicRunbookOrder = r.deterministicRunbookOrder;
    if (typeof r.temperature === 'number') next.temperature = r.temperature;
    return new FlakyOncallAdapter(next);
  }
}

/** 召回手册片段。deterministic=true 时强制确定排序（按分数降序、同分按 id 字典序）。 */
function retrieveRunbook(service: string, seed: number, deterministic: boolean): RunbookChunk[] {
  const chunks = (RUNBOOK[service] ?? []).slice();
  if (deterministic) {
    // 确定性排序：消除"同分片段返回顺序不稳"这个抖动源
    chunks.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  } else {
    // 模拟向量库对同分片段的不稳定顺序：用 seed 决定是否交换。
    // 阈值 0.79：12 个 seed 里约 2 个落在"不交换→先重启"那一面（约六分之一掷错），
    // 让 p̂≈0.83、flakiness≈0.56，与正文叙事的"六分之一概率掷错"一致。
    if (seededRandom(seed, 'order') < 0.79) chunks.reverse();
  }
  return chunks;
}

/** 模型决策的 mock：基于读到的第一条手册方向，叠加温度扰动 */
function decide(firstDirective: RunbookChunk['directive'], temperature: number, seed: number): 'escalate' | 'restart' {
  let escalate = firstDirective === 'escalate-first';
  // temperature>0 时，有小概率翻转决策（模拟采样随机性）
  if (temperature > 0 && seededRandom(seed, 'temp') < temperature * 0.15) {
    escalate = !escalate;
  }
  return escalate ? 'escalate' : 'restart';
}

/** 从指令里找服务名 */
function pickService(input: string): string {
  return Object.keys(RUNBOOK).find((s) => input.includes(s)) ?? 'payment';
}

/** 确定性伪随机：同 seed + salt 永远返回同一个 [0,1) 值，保证整章可复现 */
function seededRandom(seed: number, salt: string): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) % 100000) / 100000;
}
