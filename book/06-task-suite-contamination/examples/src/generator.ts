// 生成式任务：把题目写成"模板 + 参数"，每次评测现场实例化一批具体任务。
// 模型背不到从没出现过的参数组合，oracle 又按区间判，污染影响被参数空间稀释。

import type { EvalTask } from './types.js';

/** 连接池故障任务的参数 */
export interface PoolExhaustParams {
  service: string; // 服务名
  startMax: number; // 故障时的连接池上限
  recommendLo: number; // 合理处置的下界
  recommendHi: number; // 合理处置的上界
}

/**
 * 连接池故障任务模板：服务名、初始上限、目标区间都由参数算出。
 * oracle 不写死任何一个被背过的具体数字，只给"合理区间"。
 */
export function makePoolExhaustTask(p: PoolExhaustParams): EvalTask {
  return {
    id: `gen-pool-${p.service}-${p.startMax}`,
    // 难度档由起始上限粗略给出：上限很小（单步翻倍即可）算冒烟，其余算主线。
    // 这个字段就是"任务集设计时预留的难度标签"，第 7 章聚合分时可按档分层看。
    // hard 档通常需手工构造（含误导症状 / 干扰项），本模板暂只覆盖 smoke / core。
    tier: p.startMax <= 12 ? 'smoke' : 'core',
    input: `${p.service} 最近响应变慢，帮忙看一下。`,
    initialState: {
      logs: { [p.service]: ['db connection pool exhausted', 'timeout waiting for connection'] },
      metrics: { [p.service]: { db_pool_active: p.startMax, db_pool_max: p.startMax } },
      config: { [p.service]: { 'db.pool.max': p.startMax } },
    },
    oracle: {
      expectedFinalState: {
        config: { [p.service]: { 'db.pool.max': { gte: p.recommendLo, lte: p.recommendHi } } },
      },
      forbiddenWrites: ['restartService'], // 这道题不该重启，重启即失败
    },
  };
}

// 可参数化的取值池：服务名 × 起始上限，组合出大量从未一起出现过的题。
// 池子要足够大，实例化出的任务集才能有统计上够用的样本量（污染判定要靠它）。
const SERVICES = [
  'order-svc', 'cart-svc', 'payment-svc', 'search-svc', 'notify-svc',
  'auth-svc', 'inventory-svc', 'shipping-svc', 'review-svc', 'coupon-svc',
];
const START_MAXES = [8, 10, 12, 16, 20, 24, 30, 40, 50, 64];

/**
 * 现场实例化一批连接池故障任务。
 * @param count 要生成多少道
 * @param rng   0..1 的随机源，传入固定种子可复现（评测要可复现）
 */
export function generatePoolSuite(count: number, rng: () => number = Math.random): EvalTask[] {
  const tasks: EvalTask[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (tasks.length < count && guard++ < count * 20) {
    const service = SERVICES[Math.floor(rng() * SERVICES.length)];
    const startMax = START_MAXES[Math.floor(rng() * START_MAXES.length)];
    const key = `${service}-${startMax}`;
    if (seen.has(key)) continue; // 去重：同一组合只出一道
    seen.add(key);
    // 合理处置：把上限大致翻倍，给一个区间而非精确值
    tasks.push(
      makePoolExhaustTask({
        service,
        startMax,
        recommendLo: startMax * 2,
        recommendHi: startMax * 4,
      }),
    );
  }
  return tasks;
}

/** 一个可复现的随机源（mulberry32），固定种子可复现，足够评测场景用 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
