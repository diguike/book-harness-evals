/**
 * src/ledger.ts —— 全书来源的结构化台账
 *
 * 把“诚实边界”从一句口头约定，变成一份可查询、可校验的数据：
 * 每条来源带 tier（A/B/C）、复现状态、被哪些章引用、引用时必须带的限定。
 * 写任何一章前，查一下来源是哪一档，就知道该用什么语气、要不要标“前沿探索”。
 */

/** 三档可信度：A 成熟定论 / B 范式参照 / C 前沿探索 */
export type Tier = 'A' | 'B' | 'C';

/** 复现状态 */
export type Reproduction =
  | 'not-needed' // 不需复现（成熟定论/方法论出发点）
  | 'paradigm-only' // 只借范式，不复现其分数
  | 'min-repro' // 本书给了最小复现
  | 'not-reproduced'; // 未独立复现

export interface Source {
  id: string;
  name: string;
  tier: Tier;
  reproduction: Reproduction;
  chapters: number[]; // 被哪些章引用
  caveat: string; // 引用时必须带的限定（C 档不可为空）
}

/** 三档的中文说明，report 打印时用 */
export const TIER_LABEL: Record<Tier, string> = {
  A: 'A 档·成熟定论（直接照做）',
  B: 'B 档·范式参照（引方法不引分数）',
  C: 'C 档·前沿探索（标注出处/给复现/不当判据）',
};

/** 全书来源台账 */
export const SOURCES: Source[] = [
  // —— A 档·成熟定论 ——
  {
    id: 'anthropic-demystifying-evals',
    name: 'Anthropic — demystifying-evals',
    tier: 'A',
    reproduction: 'not-needed',
    chapters: [1, 2, 7],
    caveat: '立论锚点与“确定性优先”原则，方法论出发点',
  },
  {
    id: 'evan-miller-error-bars',
    name: 'Evan Miller — Adding Error Bars to Evals',
    tier: 'A',
    reproduction: 'min-repro',
    chapters: [4],
    caveat: '评测当统计实验，本书落成可运行 Wilson 区间',
  },
  {
    id: 'hamel-shreya-evals-faq',
    name: 'Hamel & Shreya — evals FAQ',
    tier: 'A',
    reproduction: 'not-needed',
    chapters: [6],
    caveat: 'error analysis 优先、单标注员 + 清晰规范',
  },
  {
    id: 'openai-cookbook',
    name: 'OpenAI — cookbook（评测工程实践）',
    tier: 'A',
    reproduction: 'not-needed',
    chapters: [4, 7],
    caveat: '业界常规做法对照，非照搬代码',
  },

  // —— B 档·范式参照 ——
  {
    id: 'tau-bench',
    name: 'τ-bench / τ² / τ³（Sierra）',
    tier: 'B',
    reproduction: 'paradigm-only',
    chapters: [12, 14],
    caveat: '引 pass^k 与 LLM 模拟用户范式，不引具体模型分数',
  },
  {
    id: 'gaia',
    name: 'GAIA',
    tier: 'B',
    reproduction: 'paradigm-only',
    chapters: [3],
    caveat: '难度天花板参照；15% 是 2023 历史值，引用必须标年份',
  },
  {
    id: 'hal',
    name: 'HAL（Princeton Holistic Agent Leaderboard）',
    tier: 'B',
    reproduction: 'paradigm-only',
    chapters: [17],
    caveat: '引标准化 + 并行 + 日志审查范式，不引排行榜名次',
  },
  {
    id: 'bfcl',
    name: 'BFCL（UC Berkeley Gorilla）',
    tier: 'B',
    reproduction: 'paradigm-only',
    chapters: [3, 7],
    caveat: 'AST 子串匹配做确定性验证；“first comprehensive”是项目自称',
  },
  {
    id: 'ares',
    name: 'ARES（Stanford，PPI）',
    tier: 'B',
    reproduction: 'paradigm-only',
    chapters: [4],
    caveat: '引 PPI 给统计置信区间的范式',
  },
  {
    id: 'inspect-ai',
    name: 'Inspect AI（UK AISI）',
    tier: 'B',
    reproduction: 'paradigm-only',
    chapters: [15, 17],
    caveat: '引定位与能力边界，非具体版本 API',
  },
  {
    id: 'langfuse',
    name: 'Langfuse',
    tier: 'B',
    reproduction: 'paradigm-only',
    chapters: [15, 17],
    caveat: '引 trace + datasets + 在线监控定位，非具体版本 API',
  },
  {
    id: 'opencua',
    name: 'OpenCUA（NeurIPS 2025）',
    tier: 'B',
    reproduction: 'paradigm-only',
    chapters: [9, 14],
    caveat:
      '归 B 档而非 A 档：单篇 NeurIPS 2025、核心结论“在线/离线相关”有数据支撑可引方法，但具体数字随设置变、不引分数',
  },

  // —— C 档·前沿探索（caveat 不可为空、reproduction 不可 not-needed）——
  {
    id: 'shapleyflow-agentshap',
    name: 'ShapleyFlow / AgentSHAP',
    tier: 'C',
    reproduction: 'min-repro',
    chapters: [10],
    caveat: '前沿探索：归因准确率未独立复现，本书自做蒙特卡洛 Shapley 近似',
  },
  {
    id: 'chief',
    name: 'CHIEF（反事实根因归因）',
    tier: 'C',
    reproduction: 'min-repro',
    chapters: [8, 11],
    caveat:
      '前沿探索：第 11 章主用，并催生第 8 章 OTAR 设计动机；定位准确率未独立复现，本书实现单点干预重跑最小机制',
  },
  {
    id: 'change-manifest',
    name: 'change manifest（数据反哺防劣化）',
    tier: 'C',
    reproduction: 'min-repro',
    chapters: [16],
    caveat:
      '前沿探索：警示——能较准预测修复(约33.7%)、几乎预测不了回归(约11.8%)，回归门禁须独立评测集兜底',
  },
  {
    id: 'hil-bench',
    name: 'HiL-Bench（Scale AI，已开源）',
    tier: 'C',
    reproduction: 'not-reproduced',
    chapters: [13],
    caveat: '前沿探索：harness 已开源；38%/12% 系 HiL-Bench 报告，本书未在其数据集复现',
  },
];

/** 按 id 查一条来源是哪一档（正文引用时先查这个） */
export function tierOf(id: string): Tier | undefined {
  return SOURCES.find((s) => s.id === id)?.tier;
}

/**
 * 校验台账：把“诚实边界”做成能在 CI 里跑的检查。
 * 返回错误列表，空数组表示通过。
 */
export function lintLedger(sources: Source[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    if (seen.has(s.id)) errors.push(`[${s.id}] 来源 id 重复`);
    seen.add(s.id);

    // C 档（前沿探索）必须有非空 caveat，否则正文引用就会失去诚实边界
    if (s.tier === 'C' && s.caveat.trim() === '') {
      errors.push(`[${s.id}] C 档来源缺少 caveat，引用前必须补全`);
    }
    // C 档不能标 not-needed：前沿结论必须显式给出复现状态，避免被当成定论
    if (s.tier === 'C' && s.reproduction === 'not-needed') {
      errors.push(`[${s.id}] C 档来源不能标 not-needed，前沿结论必须给复现状态`);
    }
    // 每条来源至少要标明被哪些章引用，否则进不了交叉引用速查
    if (s.chapters.length === 0) {
      errors.push(`[${s.id}] 未标注引用章号`);
    }
  }
  return errors;
}
