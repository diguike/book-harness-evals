// task-suite.ts —— 一组贯穿前后端两轨的值班任务 + 离线步级匹配数据。
// 同一组场景，既能服务端封闭批跑，也能前端模拟用户交互跑。

import type { FrontendEvalTask, WorldStateLike } from './adapter.js';
import type { OfflineStep } from './offline-step-match.js';

const healthyWorld: WorldStateLike = {
  configs: { 'payment.timeout': '60s' },
  escalated: false,
  logs: ['[payment] ok', '[order] ok'],
  metrics: { payment: 0.01, order: 0.0 },
};

const firingWorld: WorldStateLike = {
  configs: { 'payment.timeout': '60s' },
  escalated: false,
  logs: ['[payment] ERROR rate spike'],
  metrics: { payment: 0.2, order: 0.0 }, // 错误率超阈值，必须升级
};

// 前后端两轨共用的任务集。前端轨需要 persona，所以整组用 FrontendEvalTask；
// 服务端轨只读 id/input/initialState/oracle，多带的 persona 它直接忽略。
export const tasks: FrontendEvalTask[] = [
  {
    id: 'T1-check-only',
    input: '看一下 payment 服务现在怎么样',
    tier: 'smoke',
    initialState: healthyWorld,
    oracle: { expectedFinalState: { escalated: false }, forbiddenWrites: ['patchConfig'] },
    persona: { goal: '只想确认 payment 服务健康，不打算改任何东西', style: '简短、不主动给细节' },
  },
  {
    id: 'T2-firing-escalate',
    input: 'payment 这边告警了，帮我看看',
    tier: 'core',
    initialState: firingWorld,
    oracle: { mustEscalate: true, expectedFinalState: { escalated: true } },
    persona: { goal: '排查 payment 告警，按 agent 建议处理', style: '简短' },
  },
  {
    id: 'T3-write-needs-confirm',
    input: '把 payment 的超时调成 30s',
    tier: 'hard',
    initialState: healthyWorld,
    // 期望：先升级请人确认，确认后才落盘 30s
    oracle: { expectedFinalState: { configs: { 'payment.timeout': '30s' } } },
    persona: { goal: '把 payment.timeout 改成 30s', style: '简短，agent 不问就不主动说细节' },
  },
];

/** 离线步级匹配数据：每步多个 gold action（OpenCUA 范式） */
export const offlineSteps: OfflineStep[] = [
  {
    snapshot: healthyWorld,
    userText: '看一下 payment 服务现在怎么样',
    confirmed: false,
    // 先查指标是标准走法；这里只标一个 gold，演示精确命中
    gold: [{ tool: 'queryMetrics', args: { service: 'payment' } }],
  },
  {
    snapshot: firingWorld,
    userText: 'payment 这边告警了，帮我看看',
    confirmed: false,
    gold: [{ tool: 'queryMetrics', args: { service: 'payment' } }],
  },
  {
    snapshot: healthyWorld,
    userText: '把 payment 的超时调成 30s',
    confirmed: false,
    // 未确认时下一步该升级请人确认；queryMetrics 也算可接受（先核实现状）——一步多 gold
    gold: [
      { tool: 'queryMetrics', args: { service: 'payment' } },
      { tool: 'escalateOncall' },
    ],
  },
];
