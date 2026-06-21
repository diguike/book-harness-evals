// harness-lab/src/mastra-scorer.ts —— 把 Mastra 内建 scorer 当作整体评测里的一个打分组件接进来。
//
// 回扣第 1 章：框架自带的 scorer 评单条输出（相关性 / 忠实度 / 幻觉），评不了系统级行为。
// 第 7 章的整体分以状态基为骨架，但 Mastra 的 llm scorer 不是没用——
// 它能补一个状态基测不到的角度：agent 收尾那段话写得清不清楚、是否答到了点上。
// 接法是把它当成"附加维度"，而不是让它决定通过与否。
//
// 这里演示两种 scorer 都来自同一个 createScorer API：
//   1. 一个内建 llm scorer（answer-relevancy），评收尾文本与任务的相关性；
//   2. 一个自定义 code scorer，把第 7 章的状态基判定包成 Mastra 的 createScorer 形状，
//      这样它能进 Mastra 的 scorer 注册体系、和 llm scorer 并列管理。

import { createScorer } from '@mastra/core/evals';
import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/prebuilt';

/**
 * 内建 llm scorer：评一条收尾文本和任务输入的相关性。
 * model 走 judge，需要配好对应的 key；CI 里没 key 时跳过这一维即可。
 */
export function buildRelevancyScorer() {
  return createAnswerRelevancyScorer({
    model: 'openai/gpt-4.1', // 换成你实际在用的 judge 模型 id
  });
}

/**
 * 自定义 code scorer：把状态基判定包成 Mastra 的 createScorer。
 * generateScore 返回 1/0 —— 终态对就是 1，错就是 0，确定性、零方差（第 2 章）。
 * 这是 createScorer 的代码型用法：不配 judge、用 generateScore 直接给分，对照 llm 型写法看边界。
 */
export function buildStateScorer() {
  return createScorer<{ pass: boolean }, unknown>({
    id: 'state-match-scorer',
    name: 'State Match Scorer',
    description: '状态基评分：终态匹配 oracle 给 1，否则 0',
  }).generateScore(({ run }) => {
    // run.input 里带上算好的状态基 pass：终态对给 1、错给 0
    return run.input?.pass ? 1 : 0;
  });
}
