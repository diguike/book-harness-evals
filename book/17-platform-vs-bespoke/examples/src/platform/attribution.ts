// 平台层 · 第 9–11 章模块贡献度归因（与业务无关）
// 完整实现见第 9 章 examples/09-ablation-additivity/、第 10 章 Shapley、第 11 章反事实。
// 这里给收口包的接口占位——调研里明确：模块贡献度归因目前没有成熟开源工具，这块得自己写。

import type { HarnessAdapter, EvalTask } from './adapter.js';

/** 单模块消融贡献 Δi = Φ(H) − Φ(H−i)（第 9 章，各 Δi 不可加） */
export interface AblationResult {
  moduleId: string;
  delta: number;
}

/**
 * 逐模块消融：用 adapter.withConfig({ disable: [id] }) 关掉某模块重跑，
 * 看整体指标 Φ 掉多少。完整版在第 9 章。
 */
export async function ablate(
  _adapter: HarnessAdapter,
  _tasks: EvalTask[],
  _scoreFn: (a: HarnessAdapter) => Promise<number>,
): Promise<AblationResult[]> {
  // TODO（第 9 章完整实现）：枚举 adapter.modules()，逐个 disable 重跑算 Δ。
  return [];
}
