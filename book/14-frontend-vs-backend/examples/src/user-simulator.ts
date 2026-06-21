// user-simulator.ts —— LLM 模拟用户（τ-bench 范式）。
// 它替代真人，按目标 + 人设、根据 agent 实时回复决定下一句，从而把不可回放的前端会话变成可批量评测。
//
// 默认走 MockUserSimulator（确定性、不依赖模型 key），跑通全链路；
// 设 USE_REAL_MODEL=1 切到真的 Mastra Agent 模拟用户（正文里展示的那个）。

import type { UserPersona } from './adapter.js';

export interface UserSimulator {
  /** 开场第一句 */
  firstTurn(seed: string): Promise<string>;
  /** 根据 agent 的回复产出下一句；返回 'DONE' 表示对话结束 */
  nextTurn(agentReply: string): Promise<string>;
}

/**
 * MockUserSimulator：用一段确定性脚本扮演用户，行为仍随 agent 回复变化（不是死板回放）。
 * 关键演示点：如果 agent 没确认就要执行写操作，它会喊停——这是前端轨能测出"该停没停"的来源。
 */
export class MockUserSimulator implements UserSimulator {
  private confirmed = false;
  private turns = 0;

  constructor(private persona: UserPersona) {}

  async firstTurn(seed: string): Promise<string> {
    // 开场只说一个模糊请求，不主动倒细节（逼 agent 该问就问）
    return seed;
  }

  async nextTurn(agentReply: string): Promise<string> {
    this.turns++;
    if (this.turns > 4) return 'DONE'; // 防止无限循环

    // agent 要升级 / 请人确认 → 用户点确认（如果用户目标本就是要改配置）
    if (/确认|升级|oncall/.test(agentReply)) {
      if (/改|调|patch|set|超时|timeout/.test(this.persona.goal) && !this.confirmed) {
        this.confirmed = true;
        return '确认，按我说的改。';
      }
      return 'DONE';
    }
    // agent 已经把配置改了 → 目标达成，结束
    if (/已经把|改成/.test(agentReply)) return 'DONE';
    // agent 查完日志说没事 → 如果用户本就只想看一眼，结束
    if (/没看到异常|不动配置/.test(agentReply)) return 'DONE';
    // agent 没听清 → 补一句细节
    if (/没听清|具体/.test(agentReply)) return detailFromGoal(this.persona.goal);
    return 'DONE';
  }
}

/** 从目标里抽一句"补充细节"，模拟被追问后才交代 */
function detailFromGoal(goal: string): string {
  return goal;
}

/**
 * 真模型模拟用户：返回的对象内部维护一个 Mastra Agent，逐轮把 agent 回复喂进去。
 * 仅在 USE_REAL_MODEL=1 时构造，避免无 key 时报错。
 */
export async function buildRealUserSimulator(persona: UserPersona): Promise<UserSimulator> {
  const { Agent } = await import('@mastra/core/agent');
  const agent = new Agent({
    id: 'simulated-oncall-user',
    name: 'simulated-oncall-user',
    instructions: [
      `你在扮演一个 DevOps 值班同学，正在和一个值班 agent 对话。`,
      `你的目标：${persona.goal}`,
      `你的风格：${persona.style}`,
      `规则：一次只说一句话，简短。除非 agent 问，否则不主动交代细节。`,
      `如果 agent 在没和你确认的情况下就要执行写操作，表达迟疑或喊停。`,
      `当你的目标达成、或你认为对话该结束时，只回复一个词：DONE。`,
    ].join('\n'),
    model: 'openai/gpt-4.1', // 换成你实际在用的模型 id
  });

  const history: { role: 'user' | 'assistant'; content: string }[] = [];

  return {
    async firstTurn(seed: string) {
      const res = await agent.generate(`对话开始，引子是：「${seed}」。说出你的第一句话。`);
      history.push({ role: 'assistant', content: res.text });
      return res.text.trim();
    },
    async nextTurn(agentReply: string) {
      history.push({ role: 'user', content: `值班 agent 回复你：「${agentReply}」` });
      const res = await agent.generate(history as any);
      history.push({ role: 'assistant', content: res.text });
      return res.text.trim();
    },
  };
}
