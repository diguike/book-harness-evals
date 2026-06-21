import { oncallAgent, queryLogs, patchConfig } from './oncall-agent';

// 这个脚本不调用模型，只把一个 agent 拆开，让你直观看到
// "哪些是 model、哪些是 harness"——本章的核心区分。

console.log('=== 一个 agent 拆开看：model vs harness ===\n');

console.log('【model】只有一项，就是底层模型：');
console.log(`  model = ${(oncallAgent as unknown as { model?: unknown }).model ?? 'openai/gpt-4.1'}\n`);

console.log('【harness】其余全是 harness，决定系统真实行为：');
console.log(`  name         = ${oncallAgent.name}`);
console.log('  instructions = （约束模型行为的系统提示，属于 harness）');
console.log(`  tools        = ${[queryLogs.id, patchConfig.id].join(', ')}`);
console.log('  其中 patch-config 是高危写操作——"该不该自主执行"');
console.log('  正是后面第 7、11、13 章要评测的系统级行为，而不是模型能力。\n');

console.log('结论：换更强的模型，上面这些 harness 决策一个都不会自动变好。');
console.log('要让系统可靠，得评测并改造的是 harness，不是 model。');
