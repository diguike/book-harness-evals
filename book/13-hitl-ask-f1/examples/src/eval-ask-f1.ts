// 端到端评测：跑整组任务，采集 askEvents，与 oracle.mustEscalate 配对算 Ask-F1。
// 对比 baseline 策略和 over-cautious 策略，演示 precision/recall 怎么此消彼长。

import { createWriteWorkflow } from './guarded-write.js';
import { decideEscalation, decideEscalationOverCautious } from './escalation-policy.js';
import type { WriteInput, EscalationDecision } from './escalation-policy.js';
import { escalationTasks, type EscalationTask } from './tasks.js';
import type { AskEvent, RunResult, StepRecord } from './harness-lab.js';
import { askF1, fBeta, type AskOutcome } from './ask-f1.js';

/**
 * 用给定策略跑一道任务，返回 RunResult（含 askEvents）。
 * 评测层只看 workflow 有没有真的挂起（status === 'suspended'），
 * 这是确定性信号——不需要去猜模型"有没有想问人的意图"。
 */
async function runTask(
  task: EscalationTask,
  policy: (i: WriteInput) => EscalationDecision,
): Promise<RunResult> {
  const wf = createWriteWorkflow(policy);
  const run = await wf.createRun();
  const result = await run.start({ inputData: task.write });

  const askEvents: AskEvent[] = [];
  const steps: StepRecord[] = [];
  let executed = false;

  if (result.status === 'suspended') {
    // harness 停下来问人了：记一次 askEvent。
    // 这里 kind='escalate'（把高危写升级给人类 oncall 拍板），
    // 区别于 kind='ask'（信息不全时向用户问澄清，不一定升级）。
    const decision = policy(task.write);
    askEvents.push({
      id: `${task.id}:ask`,
      kind: 'escalate', // 升级给人类 oncall
      question: decision.reason, // 抛给人看的理由
      payload: { action: task.write.action, args: task.write.args }, // 触发升级的写操作
      stepId: `${task.id}:guarded-write`, // 关联到挂起的那一步，可接入第 8 章 OTAR
      ts: Date.now(),
    });
    // 评测里由 oracle 充当"人"的决定：该升级的批准放行，不该升级的也走完流程
    const resumed = await run.resume({ resumeData: { approved: task.oracle.mustEscalate } });
    executed = resumed.status === 'success' && task.oracle.mustEscalate;
    // 升级类轨迹步：kind='escalate' 标记这一步是停下来问人
    steps.push({
      id: `${task.id}:guarded-write`,
      kind: 'escalate',
      action: task.write.action,
      args: task.write.args,
      ts: Date.now(),
    });
  } else if (result.status === 'success') {
    executed = (result.result as { executed?: boolean } | undefined)?.executed ?? false;
    // 没升级、直接落地的写操作步：kind='write'
    steps.push({
      id: `${task.id}:guarded-write`,
      kind: 'write',
      action: task.write.action,
      args: task.write.args,
      result: { executed },
      ts: Date.now(),
    });
  }

  return {
    taskId: task.id,
    status: result.status === 'failed' ? 'fail' : 'success',
    steps,
    askEvents,
    executed,
  };
}

/** 跑一遍整组任务，打印混淆矩阵与 Ask-F1 */
async function evaluate(name: string, policy: (i: WriteInput) => EscalationDecision) {
  const outcomes: AskOutcome[] = [];
  for (const task of escalationTasks) {
    const res = await runTask(task, policy);
    outcomes.push({
      taskId: task.id,
      asked: res.askEvents.length > 0, // 实际是否升级
      mustEscalate: task.oracle.mustEscalate, // 该不该升级
    });
  }

  const m = askF1(outcomes);
  const f2 = fBeta(m.precision, m.recall, 2); // 值班场景更怕漏，看 F2

  console.log(`\n===== 策略：${name} =====`);
  console.log('混淆矩阵:');
  console.log(`  TP(该问·问了) = ${m.tp}    FP(瞎问·过度打断) = ${m.fp}`);
  console.log(`  FN(漏问·漏升级) = ${m.fn}    TN(不该问·没问) = ${m.tn}`);
  console.log(`precision = ${m.precision.toFixed(3)}  (瞎问越少越高)`);
  console.log(`recall    = ${m.recall.toFixed(3)}  (漏升级越少越高)`);
  console.log(`Ask-F1    = ${m.f1.toFixed(3)}`);
  console.log(`Ask-F2    = ${f2.toFixed(3)}  (β=2，更不容忍漏升级)`);

  // 逐条列出错在哪，方便定位
  for (const o of outcomes) {
    if (o.mustEscalate && !o.asked) console.log(`  ✗ 漏升级: ${o.taskId}`);
    if (!o.mustEscalate && o.asked) console.log(`  ✗ 过度打断: ${o.taskId}`);
  }
}

async function main() {
  await evaluate('baseline（规则升级）', decideEscalation);
  await evaluate('over-cautious（一律升级）', decideEscalationOverCautious);
  console.log(
    '\n对比：over-cautious 把 recall 抬到 1（不漏），但 precision 暴跌（疯狂打断），Ask-F1 反而更差。',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
