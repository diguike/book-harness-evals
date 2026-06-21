// 业务层 · 值班助手专属策略（贴本业务 KPI，高频改，只此业务用）
// 注意：平台层永远不会出现 patchConfig / restartService 这种业务字符串

import type { EvalTask, RunResult } from '../platform/adapter.js';
import type { EscalationPolicy } from '../platform/hooks.js';

export const oncallEscalationPolicy: EscalationPolicy = {
  // 值班策略：这次运行里只要有一步是升级动作，就认为"它请示了人"。
  // kind==='escalate' 是 canonical 字段，比按动作名硬匹配更稳。
  shouldEscalate(_task: EvalTask, result: RunResult): boolean {
    return result.steps.some((s) => s.kind === 'escalate');
  },
};
