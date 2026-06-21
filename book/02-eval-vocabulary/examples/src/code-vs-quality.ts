// 确定性评测 vs 质量评测：同一个值班场景，两种判定方式
//
// 场景：值班助手改完一条配置，并写了一段升级说明。
//   - "配置改对没有" → 有客观终态，用确定性 code scorer 判，零方差
//   - "升级说明写得清不清楚" → 主观，没有标准答案，用 LLM judge 评，有噪声
//
// 注意：Mastra 的 code scorer 内部用的也是 type: 'agent'，区分 code vs LLM 靠的是
// "有没有 judge 字段"，而不是 type 枚举（ScorerTypeShortcuts 只有 'agent' 和 'trajectory'）。
// code scorer 没有 judge、不调模型，可直接跑；quality scorer 带 judge，内部调模型，需配 API key。

import { createScorer } from '@mastra/core/evals';
import { z } from 'zod';

// ---------- 1. 确定性评测（code-based）----------
// 对照 Mastra packages/evals/src/scorers/code/ 下打分器的写法：纯代码逻辑，零方差。
// 判定"配置终态里 timeout 是否精确等于期望值"。

interface ConfigState {
  timeout: number;
}

/** 给定期望值，造一个判 timeout 是否改对的确定性 scorer */
export function createTimeoutCorrectScorer(expectedTimeout: number) {
  return createScorer({
    id: 'timeout-correct-scorer',
    name: 'Timeout Correct Scorer',
    description: '确定性判定：改完配置后 timeout 是否精确等于期望值',
    // 没有 judge 字段 → 这就是一个 code scorer，纯代码逻辑、零方差。type 仍是 'agent'
    type: 'agent',
  }).generateScore(({ run }) => {
    // run.output 里取出 agent 最终落定的配置态（这里直接示意）
    const finalState = (run as { finalState?: ConfigState }).finalState;
    return finalState?.timeout === expectedTimeout ? 1 : 0; // 1 对 / 0 错，跑一百遍都一样
  });
}

/** 不依赖 Mastra 运行时、可直接验证的同款判定逻辑 */
export function codeScore(finalState: ConfigState, expected: number): number {
  return finalState.timeout === expected ? 1 : 0;
}

// ---------- 2. 质量评测（model-graded）----------
// 对照 Mastra packages/evals/src/scorers/llm/ 下打分器：内部揣一个 LLM judge。
// 判定"升级说明写得清不清楚"——主观，judge 两次打分可能不同。

const JUDGE_INSTRUCTIONS = `
你是评估值班升级说明清晰度的裁判。给定一段升级说明，判断它是否清楚说明了：
1) 改动了什么 2) 为什么有风险 3) 需要人确认什么。
三点都清楚给高分，含糊或缺失给低分。
`;

/** 造一个评升级说明清晰度的 LLM judge scorer；model 由调用方注入 */
export function createEscalationClarityScorer(model: unknown) {
  return createScorer({
    id: 'escalation-clarity-scorer',
    name: 'Escalation Clarity Scorer',
    description: '质量判定：升级说明写得清不清楚（LLM judge，有方差）',
    judge: {
      model: model as never, // 换成你实际在用的模型 id，如 'openai/gpt-4.1'
      instructions: JUDGE_INSTRUCTIONS,
    },
    type: 'agent',
  })
    .analyze({
      description: '让 judge 给清晰度打 0~1',
      outputSchema: z.object({ clarity: z.number().min(0).max(1) }),
      createPrompt: ({ run }) => {
        // 示意：真实管线里这段升级说明来自 RunResult.askEvents[0].payload；
        // 这里从 scorer 的 run.input 取，保证示例自洽可跑
        const note = String((run as { input?: unknown }).input ?? '');
        return `请给下面这段升级说明的清晰度打 0 到 1 的分，只返回 { "clarity": 数字 }：\n${note}`;
      },
    })
    .generateScore(({ results }) => results.analyzeStepResult?.clarity ?? 0);
}

// ---------- 演示 ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  // 确定性部分：无需模型、无需 key，直接跑
  console.log('=== 确定性评测（code-based，零方差）===');
  const expected = 60;
  for (const state of [{ timeout: 60 }, { timeout: 30 }]) {
    console.log(
      `timeout=${state.timeout}, 期望=${expected} → 分=${codeScore(state, expected)}（跑几遍都一样）`,
    );
  }

  console.log('\n=== 质量评测（model-graded，有方差）===');
  console.log(
    'createEscalationClarityScorer 已按 Mastra LLM judge 形状构造完成。',
  );
  console.log(
    '它内部封装一个 judge 模型，对"升级说明清不清楚"打分——同一段文本两次打分可能不同。',
  );
  console.log(
    '需配模型 API key 才能真正跑 judge；这里只演示两种判定方式的形状差异。',
  );
  console.log(
    '\n口径：能用代码判的（配置改对没有）别请 LLM；只有主观质量（说明清不清楚）才动用 judge。',
  );
}
