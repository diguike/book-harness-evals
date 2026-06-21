import type { Rerun } from './locate.js';
import type { Intervention } from './intervention.js';

/**
 * 确定性桩重跑器（无需 API key）。
 *
 * 它不跑真模型，而是用一条规则模拟「agent 在被干预后会不会改对方向」，
 * 专门用来让你看清反事实定位的算法骨架和翻转逻辑。规则刻意做成可解释的：
 *
 *   翻转条件 = 这次干预让 agent 不再顺着「那篇错误手册 O3」走向激进扩容。
 *   - 干预 O3（删/换）              → 没了误导手册，agent 改去查慢 SQL  ⇒ 翻转
 *   - 干预 T2（换成"先查慢查询"结论）→ 直接换掉错误结论                  ⇒ 翻转
 *   - 干预 O2（监控）                → 连接池确实是满的，这是真观察、不是病灶 ⇒ 不翻转
 *   - 干预 O1 / T1                    → 不触碰错误手册这条主线           ⇒ 不翻转
 *
 * 注意 O2 不翻转：它是一条「真实但不是病根」的观察，故意留在因果链上，
 * 用来演示反事实如何把「真观察」和「病灶」区分开（正文：旁证 vs 病灶）。
 *
 * 为体现「重跑有噪声、须重复 k 次取翻转率」（正文诚实边界第一条），
 * 给 T2 注入一点抖动：它有 ~85% 概率翻转，单次结果不可全信。
 */

/** 哪些干预目标在桩世界里能让 agent 改对方向 */
const FLIP_TARGETS = new Set(['O3', 'T2']);

// 确定性桩版：不真正调 adapter、也不跑 agent，只查 FLIP_TARGETS 规则表返回终态。
// 返回的 Rerun 与真版（rerun-mastra.ts）签名一致，可直接喂给 locateRootCause。
export function makeStubRerun(seed = 1): Rerun {
  // 一个极简可复现伪随机数，避免引入依赖
  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  return async (intv: Intervention): Promise<'success' | 'fail'> => {
    if (!FLIP_TARGETS.has(intv.targetId)) return 'fail';
    // T2 注入抖动：体现单次不可信、要重复采样
    if (intv.targetId === 'T2') return rand() < 0.85 ? 'success' : 'fail';
    return 'success';
  };
}
