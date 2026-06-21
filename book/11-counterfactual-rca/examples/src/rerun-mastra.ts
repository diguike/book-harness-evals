import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Rerun } from './locate.js';
import type { Intervention } from './intervention.js';
import { FAILED_TRACE, FAILING_ACTION_ID } from './fixture.js';
import { locateRootCause } from './locate.js';

/**
 * 真模型版重跑器（需要 API key，跑 npm run start:mastra）。
 *
 * 思路与第 5 章 MastraOncallAdapter 一致：每次重跑现造一个隔离的值班助手，
 * 区别只在「把当前干预注入到环境桩 / 工具返回里」——这正是反事实「只动第 i 步、其余不动」。
 *
 * 这里把干预落到工具返回上演示：
 *   - 干预 O3（搜手册）：searchRunbook 不再返回那篇错误手册（ablate/substitute）；
 *   - 干预 O2（查监控）：queryMetrics 返回对照数据（substitute）；
 *   - 其余目标：工具照常返回。
 * 真实项目里干预的注入点应由 adapter 的 initialState 统一承载，这里为最小演示直接拦在工具里。
 */

interface WorldStub {
  // 这次重跑被干预了哪个节点、怎么动
  intervention: Intervention | null;
  // agent 是否最终改去查慢查询并修对（用于判定终态）
  fixedCorrectly: boolean;
}

function buildOncallTools(world: WorldStub) {
  const queryMetrics = createTool({
    id: 'queryMetrics',
    description: '查询某服务的监控指标',
    inputSchema: z.object({ service: z.string() }),
    outputSchema: z.object({ summary: z.string() }),
    execute: async () => {
      // 干预 O2：换成对照监控（慢查询飙升，而非连接池满）
      if (world.intervention?.targetId === 'O2') {
        return { summary: 'order-db 慢查询 QPS 飙升，单条全表扫描 SQL 占用大量连接' };
      }
      return { summary: 'order-db 连接池使用率 100%，max_connections=50 已打满' };
    },
  });

  const searchRunbook = createTool({
    id: 'searchRunbook',
    description: '查值班手册',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ docs: z.array(z.string()) }),
    execute: async () => {
      // 干预 O3：删掉那篇误导手册
      if (world.intervention?.targetId === 'O3') {
        return { docs: ['《延迟突增排查》：先确认是连接耗尽还是慢查询，区分对待'] };
      }
      return { docs: ['《连接池打满的应急处理》：临时调大连接池上限可缓解'] };
    },
  });

  const investigateSlowQuery = createTool({
    id: 'investigateSlowQuery',
    description: '排查慢查询，定位高耗时 SQL',
    inputSchema: z.object({ service: z.string() }),
    outputSchema: z.object({ found: z.string() }),
    execute: async () => {
      world.fixedCorrectly = true; // 走到这步即视为修对了方向
      return { found: '定位到一条全表扫描 SQL，已建议加索引' };
    },
  });

  return { queryMetrics, searchRunbook, investigateSlowQuery };
}

export function makeMastraRerun(): Rerun {
  return async (intv: Intervention): Promise<'success' | 'fail'> => {
    const world: WorldStub = { intervention: intv, fixedCorrectly: false };
    const tools = buildOncallTools(world);
    const agent = new Agent({
      id: 'oncall',
      name: 'oncall',
      instructions:
        '你是 DevOps 值班助手。order-api 延迟告警，请查清原因并修复。' +
        '优先区分"连接耗尽"与"慢查询"两类根因：若是慢查询请调用 investigateSlowQuery，不要盲目调大连接池。',
      model: 'openai/gpt-4.1', // 换成你实际在用的模型 id
      tools,
    });
    try {
      await agent.generate('order-api 的 P99 延迟超过 2s，请处理。');
    } catch {
      return 'fail';
    }
    // 终态判定：是否改去查了慢查询并修对（替代真实 oracle 的 expectedFinalState 比对）
    return world.fixedCorrectly ? 'success' : 'fail';
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('未检测到 OPENAI_API_KEY。真模型版需要 API key；想先理解算法请跑 npm start（桩版）。');
    process.exit(1);
  }
  const result = await locateRootCause(FAILED_TRACE, FAILING_ACTION_ID, makeMastraRerun(), {
    repeats: 5, // 真模型有抖动，重复多次取翻转率
    flipThreshold: 0.6,
  });
  for (const v of result.verdicts) {
    console.log(`${v.node.id} ${v.intervention.kind} 翻转率 ${v.flippedTimes}/${v.repeats} ${v.isFlip ? '翻转点' : '旁证'}`);
  }
  console.log(`根因（最上游翻转点）：${result.rootCause?.id ?? '无单点翻转'}`);
}

// 仅在直接运行本文件时执行 main（被 import 时不触发）
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
