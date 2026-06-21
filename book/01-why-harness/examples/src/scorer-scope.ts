import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/prebuilt';

// 这个脚本演示 Mastra 自带 scorer 的"边界"：
// 它对【单条输出】打 0-1 分，评不了整个 harness 的系统级行为。
//
// 运行需要配置模型 API key（scorer 内部用 LLM 当 judge）。
// 没配 key 时，可只看本文件结构理解它的输入输出形状。

async function main() {
  const scorer = createAnswerRelevancyScorer({
    model: 'openai/gpt-4.1', // 换成你实际在用的模型 id
  });

  // scorer 的输入：一条 input + 一条 output。注意——它的视野只到"一问一答"
  const result = await scorer.run({
    input: { inputMessages: [{ role: 'user', content: '支付服务最近有报错吗？' }] },
    output: [{ role: 'assistant', content: '支付服务最近 15 分钟没有 ERROR 级别日志。' }],
  } as never);

  console.log('单条输出的相关性分：', (result as { score: number }).score);

  console.log('\n它能回答的：这一条回答相不相关、忠不忠实、有没有幻觉。');
  console.log('它回答不了的：');
  console.log('  - 值班助手在十几步任务里，该不该在第七步停下来问人？');
  console.log('  - 它误删配置，根因是哪一步？');
  console.log('  - 同样任务跑十次，结果稳不稳定？');
  console.log('  - 改了一版之后，整个系统退没退化？');
  console.log('\n这些系统级问题，正是本书后面各章要自己装上的评测能力。');
}

main().catch(err => {
  console.error('运行失败（多半是没配模型 API key）：', err.message);
  console.error('不影响理解——重点是看清 scorer 的输入只有"一问一答"。');
});
