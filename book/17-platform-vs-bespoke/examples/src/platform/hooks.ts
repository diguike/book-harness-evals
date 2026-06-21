// 平台层 · 业务特化的钩子接口（平台只定义形状，不写任何业务判断）
// 业务把自己的策略注入这些钩子，而不是去 fork/改平台

import type { EvalTask, RunResult } from './adapter.js';

/** 升级策略钩子：给定任务和一次运行结果，业务自己判断这次"该不该升级" */
export interface EscalationPolicy {
  // 业务专属字符串（如 patchConfig）只会出现在业务实现里，平台看不到
  shouldEscalate(task: EvalTask, result: RunResult): boolean;
}

/** 成功判定钩子：业务决定一次 run 算不算"成功"（默认口径见 scoring.ts） */
export interface SuccessPolicy {
  isSuccess(task: EvalTask, result: RunResult): boolean;
}
