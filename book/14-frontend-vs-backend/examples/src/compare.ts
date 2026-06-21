// compare.ts —— 双轨对照入口。
// 同一组任务，服务端轨封闭批跑 + 状态基评分；前端轨模拟用户交互 + judge + 离线步级匹配。
// 三个数分开报、各带 CI，演示"离线哨兵守日常、在线验收做里程碑"的分工。
//
// 跑：npm run compare         （默认 mock，不依赖模型 key）
//     USE_REAL_MODEL=1 npm run compare （切真 Mastra Agent 模拟用户 + LLM judge）

import { BackendBatchAdapter } from './backend-adapter.js';
import { FrontendPanelAdapter } from './frontend-adapter.js';
import { stateScore } from './state-scorer.js';
import { heuristicInteractionJudge } from './interaction-judge.js';
import { stepMatchScore } from './offline-step-match.js';
import { tasks, offlineSteps } from './task-suite.js';
import { wilson, fmt } from './stats.js';

async function main() {
  console.log('=== 第 14 章 前端 / 服务端双轨对照 ===\n');

  // ---- 服务端轨：封闭批跑 + 状态基评分（每次提交 CI 主力）----
  const backend = new BackendBatchAdapter();
  let beSuccess = 0;
  for (const task of tasks) {
    const r = await backend.run(task);
    const s = stateScore(r, task.oracle);
    beSuccess += s;
    console.log(`[服务端] ${task.id}  状态基=${s}  升级=${(r.finalState as any).escalated}`);
  }
  const beCI = wilson(beSuccess, tasks.length);
  console.log(
    `\n服务端整体分（状态基）: ${fmt(beCI.point)}  95%CI [${fmt(beCI.low)}, ${fmt(beCI.high)}]\n`,
  );

  // ---- 前端在线轨：模拟用户交互 + judge（里程碑验收，带方差，跑 K 次看 pass^k）----
  const frontend = new FrontendPanelAdapter();
  const K = 3; // 每条任务重复 K 次估稳定性（第 12 章 pass^k 思路）
  let feJudgeSum = 0;
  let feJudgeN = 0;
  let allPass = 0;
  for (const task of tasks) {
    let passAll = true;
    let avg = 0;
    for (let k = 0; k < K; k++) {
      const r = await frontend.run(task);
      const j = heuristicInteractionJudge(r);
      avg += j.score;
      feJudgeSum += j.score;
      feJudgeN += 1;
      if (j.score < 0.8) passAll = false;
      if (k === 0) {
        console.log(`[前端] ${task.id}  judge=${fmt(j.score)}  对话轮数=${r.transcript.length}`);
        console.log(`        理由: ${j.reasons.join('；')}`);
      }
    }
    if (passAll) allPass += 1; // pass^k：K 次全过才算这条任务稳
    void avg;
  }
  const feCI = wilson(Math.round(feJudgeSum), feJudgeN);
  console.log(
    `\n前端在线 judge 均分: ${fmt(feJudgeSum / feJudgeN)}  95%CI [${fmt(feCI.low)}, ${fmt(feCI.high)}]`,
  );
  console.log(`前端 pass^${K}（K 次全过的任务占比）: ${fmt(allPass / tasks.length)}\n`);

  // ---- 前端离线轨：步级匹配（每次提交 CI 哨兵，确定、无方差）----
  const offline = stepMatchScore(offlineSteps);
  console.log(`前端离线步级匹配分（CI 哨兵）: ${fmt(offline)}  （${offlineSteps.length} 步，一步多 gold）\n`);

  // ---- 收口：三个数分开报，不揉成一个加权总分 ----
  console.log('--- 双轨报分（分开看，谁掉一眼定位）---');
  console.log(`服务端状态基   : ${fmt(beCI.point)}   ← 每次提交 CI`);
  console.log(`前端离线步级   : ${fmt(offline)}   ← 每次提交 CI 哨兵`);
  console.log(`前端在线 judge : ${fmt(feJudgeSum / feJudgeN)}   ← 里程碑验收（带方差）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
