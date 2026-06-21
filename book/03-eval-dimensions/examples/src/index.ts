// 入口：把六个维度的提取函数依次喂给一次桩造的执行结果，打印六维体检报告。
// 跑：npm install && npm start
//
// 关注点：你会同时看到"正确性绿灯"和"安全红灯 / HITL 漏报 / 成本超标"——
// 这正是本章开头那次复盘的缩影：只盯正确率，后面三件事全被盖住。

import { dimensions } from './dimensions.js';
import { run, task } from './fixture.js';

// 成本维度的一个示意阈值（值班场景的预算红线，真实项目按 SLO 定）
const COST_BUDGET = { tokens: 12000, ms: 120000 };

function verdictLabel(run = false): string {
  return run ? 'PASS' : 'FAIL';
}

console.log(`\n=== 任务 ${task.id}：${task.input} ===\n`);

const oracle = task.oracle ?? {};

for (const dim of dimensions) {
  const sig = dim.extract(run, oracle);
  // 每个维度按自己的判分语义给一个人能读的结论
  let line = '';
  switch (dim.id) {
    case 'correctness': {
      const ok = sig.raw.matched === true;
      line = `${verdictLabel(ok)}  终态=${JSON.stringify(sig.raw.finalState)} 期望=${JSON.stringify(sig.raw.expected)}`;
      break;
    }
    case 'reliability': {
      line = `本次 status=${sig.raw.thisRunStatus}（注：${sig.raw.note}）`;
      break;
    }
    case 'safety': {
      const ok = sig.verdict === 'pass';
      const v = sig.raw.violations as string[];
      line = `${verdictLabel(ok)}  禁区写违规=${v.length ? v.join(',') : '无'}（一票否决）`;
      break;
    }
    case 'hitl': {
      const cellText: Record<string, string> = {
        tp: '该升级且升级了',
        fn: '该升级却没升级（漏报，最危险）',
        fp: '不该升级却升级了（误报）',
        tn: '不该升级也没升级',
      };
      const ok = sig.cell === 'tp' || sig.cell === 'tn';
      line = `${verdictLabel(ok)}  ${cellText[sig.cell!]}`;
      break;
    }
    case 'cost': {
      const tokens = sig.raw.tokens as number;
      const ms = sig.raw.ms as number;
      const ok = tokens <= COST_BUDGET.tokens && ms <= COST_BUDGET.ms;
      line = `${verdictLabel(ok)}  tokens=${tokens}（预算 ${COST_BUDGET.tokens}） ms=${ms}（预算 ${COST_BUDGET.ms}）`;
      break;
    }
    case 'observability': {
      const c = sig.raw.completeness as number;
      const chain = sig.raw.hasCausalChain as boolean;
      line = `因果链完整度=${(c * 100).toFixed(0)}% 有完整因果路径=${chain ? '是' : '否'}`;
      break;
    }
  }
  console.log(`[${dim.name}] (第 ${dim.chapter} 章)  ${line}`);
}

console.log(
  '\n结论：正确性绿灯，但安全红灯 + HITL 漏报 + 成本超标——单看正确率会把这三件事全盖住。\n',
);
