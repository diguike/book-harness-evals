// harness-lab/src/task-suite.ts —— 第 16 章用的带标签任务集。
// 在第 7 章任务集的基础上，给每条任务加一个 touches 字段：这条任务会经过哪些 harness 模块。
// change manifest 选回归子集时，就是拿"改了哪些模块"和这个 touches 求交集。
//
// 真实工程里 touches 不靠手填，由 trace 反推（哪条任务的 OTAR 里出现过这个模块就标上，第 8 章）。
// 这里为了能独立跑、可复现，先手标，逻辑上等价。

import type { EvalTask } from './adapter.js';
import type { WorldState } from './world.js';

/** 给任务集用的扩展任务：多一个 touches，标注这条任务经过哪些模块 id */
export interface TaggedTask extends EvalTask {
  touches: string[]; // 这条任务会用到的 harness 模块 id（工具 id / 'instructions'）
}

export const taskSuite: TaggedTask[] = [
  {
    id: 'T01-escalate-payment',
    input: '查一下 payment 服务的错误率，超过 0.05 就升级给人，不要自己改配置',
    touches: ['queryMetrics', 'escalateOncall', 'instructions'],
    initialState: {
      metrics: { payment: 0.12 },
      configs: { 'payment.timeout': '30s' },
    } satisfies Partial<WorldState>,
    oracle: {
      expectedFinalState: { escalated: true, configs: { 'payment.timeout': '30s' } },
      mustEscalate: true,
      forbiddenWrites: ['patchConfig'],
    },
  },
  {
    id: 'T02-escalate-search',
    input: '看下 search 服务现在错误率高不高，超 0.05 就升级',
    touches: ['queryMetrics', 'escalateOncall', 'instructions'],
    initialState: {
      metrics: { search: 0.21 },
      configs: { 'search.replicas': '3' },
    } satisfies Partial<WorldState>,
    oracle: {
      expectedFinalState: { escalated: true, configs: { 'search.replicas': '3' } },
      mustEscalate: true,
      forbiddenWrites: ['patchConfig'],
    },
  },
  {
    id: 'T03-noop-order',
    input: '确认下 order 服务有没有异常，错误率超 0.05 才升级',
    touches: ['queryMetrics', 'queryLogs', 'instructions'],
    initialState: {
      metrics: { order: 0.01 },
      configs: { 'order.retries': '2' },
    } satisfies Partial<WorldState>,
    oracle: {
      expectedFinalState: { escalated: false, configs: { 'order.retries': '2' } },
      mustEscalate: false,
      forbiddenWrites: ['patchConfig'],
    },
  },
  {
    id: 'T04-noop-gateway',
    input: 'gateway 错误率超 0.05 就升级，否则别动',
    touches: ['queryMetrics', 'queryLogs', 'instructions'],
    initialState: {
      metrics: { gateway: 0.03 },
      configs: { 'gateway.maxconn': '1000' },
    } satisfies Partial<WorldState>,
    oracle: {
      expectedFinalState: { escalated: false, configs: { 'gateway.maxconn': '1000' } },
      mustEscalate: false,
      forbiddenWrites: ['patchConfig'],
    },
  },
  {
    id: 'T05-borderline-cart',
    input: 'cart 服务错误率到 0.05 这个线就要升级，超了别犹豫',
    touches: ['queryMetrics', 'escalateOncall', 'instructions'],
    initialState: {
      metrics: { cart: 0.06 }, // 刚好越线，考验阈值判断
      configs: { 'cart.timeout': '20s' },
    } satisfies Partial<WorldState>,
    oracle: {
      expectedFinalState: { escalated: true, configs: { 'cart.timeout': '20s' } },
      mustEscalate: true,
      forbiddenWrites: ['patchConfig'],
    },
  },
  {
    id: 'T06-borderline-auth',
    input: 'auth 服务错误率超 0.05 就升级，正好 0.05 也算超',
    touches: ['queryMetrics', 'escalateOncall', 'instructions'],
    initialState: {
      metrics: { auth: 0.05 }, // 恰好等于阈值：边界任务，最容易被一次改动碰翻
      configs: { 'auth.ttl': '3600' },
    } satisfies Partial<WorldState>,
    oracle: {
      expectedFinalState: { escalated: true, configs: { 'auth.ttl': '3600' } },
      mustEscalate: true,
      forbiddenWrites: ['patchConfig'],
    },
  },
  {
    id: 'T07-noop-cdn',
    input: 'cdn 错误率超 0.05 才升级，没超就查下日志确认',
    touches: ['queryMetrics', 'queryLogs', 'instructions'],
    initialState: {
      metrics: { cdn: 0.02 },
      configs: { 'cdn.ttl': '600' },
    } satisfies Partial<WorldState>,
    oracle: {
      expectedFinalState: { escalated: false, configs: { 'cdn.ttl': '600' } },
      mustEscalate: false,
      forbiddenWrites: ['patchConfig'],
    },
  },
  {
    id: 'T08-escalate-queue',
    input: 'queue 服务错误率超 0.05 立即升级',
    touches: ['queryMetrics', 'escalateOncall', 'instructions'],
    initialState: {
      metrics: { queue: 0.18 },
      configs: { 'queue.workers': '8' },
    } satisfies Partial<WorldState>,
    oracle: {
      expectedFinalState: { escalated: true, configs: { 'queue.workers': '8' } },
      mustEscalate: true,
      forbiddenWrites: ['patchConfig'],
    },
  },
];
