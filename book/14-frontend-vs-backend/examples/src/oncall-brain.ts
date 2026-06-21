// oncall-brain.ts —— 值班 agent 侧的决策逻辑，前后端两轨共用同一个 brain。
// 真实工程里这一层是 Mastra Agent（model + tools + instructions）；这里用一段确定性脚本
// 替代模型决策，让两轨都能离线跑通、可复现。换成真 Agent 时只换这一层，两条轨的适配器不动。
//
// 决策规则（刻意做得可解释，方便步级匹配标 gold）：
//   1. 指令里能解析出服务名 → 先 queryMetrics
//   2. 错误率超阈值 → escalateOncall（高危，升级给人）
//   3. 用户明确要求改配置且已确认 → patchConfig（高危写，需人在回路）
//   4. 否则 → queryLogs 收尾

import type { AgentAction, WorldStateLike } from './adapter.js';

export interface BrainConfig {
  threshold: number; // 错误率升级阈值
  disabled: Set<string>; // 被消融关掉的工具
}

export function defaultBrainConfig(): BrainConfig {
  return { threshold: 0.05, disabled: new Set() };
}

/** 从一句话里找出现在 world 里的服务名 */
export function pickService(text: string, world: WorldStateLike): string | undefined {
  const candidates = new Set([
    ...Object.keys(world.metrics),
    ...Object.keys(world.configs).map((k) => k.split('.')[0]),
  ]);
  return [...candidates].find((s) => text.includes(s));
}

/** 给定用户当前这句话和 world，决定 agent 接下来要走的动作序列（可能多步） */
export function decideActions(
  userText: string,
  world: WorldStateLike,
  cfg: BrainConfig,
  confirmed: boolean, // 用户是否已明确确认这次写操作
): AgentAction[] {
  const service = pickService(userText, world);
  if (!service) return [];

  const actions: AgentAction[] = [];
  if (!cfg.disabled.has('queryMetrics')) {
    actions.push({ tool: 'queryMetrics', args: { service } });
  }

  const errorRate = world.metrics[service] ?? 0;
  const wantsWrite = /改|调|设置|patch|set/.test(userText);

  if (errorRate > cfg.threshold && !cfg.disabled.has('escalateOncall')) {
    // 错误率高：升级给人，不自作主张
    actions.push({ tool: 'escalateOncall', args: { reason: `${service} 错误率 ${errorRate} 超阈值` } });
  } else if (wantsWrite) {
    // 用户想改配置：只有在已确认时才落盘，否则先升级请人确认（人在回路）
    if (confirmed && !cfg.disabled.has('patchConfig')) {
      const key = guessKey(userText, world);
      actions.push({ tool: 'patchConfig', args: { key, value: guessValue(userText) } });
    } else if (!cfg.disabled.has('escalateOncall')) {
      actions.push({ tool: 'escalateOncall', args: { reason: `${service} 待改配置，需确认` } });
    }
  } else if (!cfg.disabled.has('queryLogs')) {
    actions.push({ tool: 'queryLogs', args: { service } });
  }
  return actions;
}

/** agent 给用户的自然语言回复（前端轨用，喂给模拟用户决定下一句） */
export function brainReply(actions: AgentAction[], world: WorldStateLike): string {
  if (actions.length === 0) return '我没听清你指的是哪个服务，能说得具体点吗？';
  const last = actions[actions.length - 1];
  switch (last.tool) {
    case 'escalateOncall':
      return '这步有风险，我先升级给人类 oncall 确认，等你点确认我再动手。';
    case 'patchConfig':
      return `好的，我已经把 ${(last.args as any)?.key} 改成 ${(last.args as any)?.value}。`;
    case 'queryLogs':
      return '我查了下日志，没看到异常，先不动配置。';
    default:
      return '我先看了下监控指标。';
  }
}

function guessKey(text: string, world: WorldStateLike): string {
  const k = Object.keys(world.configs).find((key) => text.includes(key.split('.')[0]));
  return k ?? 'unknown.key';
}

function guessValue(text: string): string {
  const m = text.match(/(\d+\w*)/);
  return m ? m[1] : 'updated';
}
