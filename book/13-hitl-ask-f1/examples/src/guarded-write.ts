// 高危写操作 workflow：用 Mastra workflow 的 suspend/resume 把"问人"做成可挂起的环节。
// API 照搬 Mastra 源码 packages/core/src/workflows/create.ts 与测试 nested-resume-label.test.ts。

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { MockStore } from '@mastra/core/storage';
import { z } from 'zod';
import {
  decideEscalation,
  type EscalationDecision,
  type WriteInput,
} from './escalation-policy.js';

// 模拟执行写操作（真实实现对接你的配置中心/编排系统）
async function applyWrite(input: WriteInput): Promise<void> {
  // 这里只打印，示例不真的改任何东西
  console.log(`  [write] 执行 ${input.action}`, input.args);
}

/**
 * 工厂：用一个升级策略构造 guarded-write step。
 * 把策略作为参数注入，方便评测时切换 baseline / over-cautious 变体。
 */
export function createGuardedWriteStep(policy: (i: WriteInput) => EscalationDecision) {
  return createStep({
    id: 'guarded-write',
    inputSchema: z.object({
      action: z.string(),
      args: z.record(z.any()),
    }),
    outputSchema: z.object({
      executed: z.boolean(), // 写操作最终是否落地
      escalated: z.boolean(), // 是否升级问了人
    }),
    // 挂起时抛给人类 oncall 看的内容
    suspendSchema: z.object({
      reason: z.string(),
      action: z.string(),
      args: z.record(z.any()),
    }),
    // 人类回来时要带的决定
    resumeSchema: z.object({
      approved: z.boolean(),
    }),
    execute: async ({ inputData, resumeData, suspend }) => {
      // 第一次进来还没有人的决定：让策略判断该不该升级
      if (!resumeData) {
        const decision = policy(inputData as WriteInput);
        if (decision.shouldAsk) {
          // 该问人：挂起整条 workflow，把理由抛出去等人批
          await suspend({
            reason: decision.reason,
            action: inputData.action,
            args: inputData.args,
          });
          // suspend 之后这一帧返回值不被采用，resume 时会重新进 execute
          return { executed: false, escalated: true };
        }
        // 判断不用问人：直接执行
        await applyWrite(inputData as WriteInput);
        return { executed: true, escalated: false };
      }

      // resume 回来了：带着人的决定
      // escalated=true 代表经历了人工审批环节；executed 取决于人批不批：
      // 批准才落地写操作，否决则写操作不落地，executed=false。
      if (resumeData.approved) {
        await applyWrite(inputData as WriteInput);
        return { executed: true, escalated: true };
      }
      return { executed: false, escalated: true };
    },
  });
}

/**
 * 把 guarded-write step 装进一条可提交的 workflow。
 * suspend/resume 需要一个存储来持久化挂起快照，这里挂一个内存 MockStore，
 * 并把 workflow 注册到 Mastra 实例上（resume 时引擎据此找回快照）。
 */
export function createWriteWorkflow(policy: (i: WriteInput) => EscalationDecision) {
  const step = createGuardedWriteStep(policy);
  const workflow = createWorkflow({
    id: 'guarded-write-wf',
    inputSchema: step.inputSchema,
    outputSchema: step.outputSchema,
  })
    .then(step)
    .commit();

  // 注册到带存储的 Mastra 实例，保证挂起快照能持久化、可 resume
  new Mastra({
    logger: false,
    storage: new MockStore(),
    workflows: { 'guarded-write-wf': workflow },
  });

  return workflow;
}

// 直接运行本文件时，演示一次"挂起 → 人否决 → 完成"的完整链路
async function demo() {
  const wf = createWriteWorkflow(decideEscalation);
  const run = await wf.createRun();

  console.log('▶ 提交一个高危写操作：把连接池上限从 200 改成 20');
  const result = await run.start({
    inputData: { action: 'patchConfig', args: { key: 'db.pool.max', from: 200, to: 20 } },
  });

  console.log('  workflow 状态:', result.status); // 期望 'suspended'

  if (result.status === 'suspended') {
    console.log('  ↳ harness 停下来问人了（这是一次 askEvent）');
    console.log('  ↳ 模拟值班人否决这次变更');
    const resumed = await run.resume({ resumeData: { approved: false } });
    console.log('  最终状态:', resumed.status); // 期望 'success'
  }
}

// tsx 直接运行入口
if (import.meta.url === `file://${process.argv[1]}`) {
  demo().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
