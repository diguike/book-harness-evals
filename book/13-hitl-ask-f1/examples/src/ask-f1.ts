// Ask-F1：把"该不该停下来问人"当二分类，用混淆矩阵 + precision/recall/F1 衡量。
// 升级（ask）= 正类。该问没问（FN，漏升级）、不该问瞎问（FP，过度打断）都扣分。

export interface AskOutcome {
  taskId: string;
  asked: boolean; // 系统是否真的升级问人了（askEvents 非空）
  mustEscalate: boolean; // oracle：该不该升级
}

export interface AskMetrics {
  tp: number;
  fp: number; // 过度打断
  fn: number; // 漏升级
  tn: number;
  precision: number;
  recall: number;
  f1: number;
}

export function askF1(outcomes: AskOutcome[]): AskMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const o of outcomes) {
    if (o.mustEscalate && o.asked) tp++; // 该问，问了
    else if (!o.mustEscalate && o.asked) fp++; // 不该问，瞎问 → 过度打断
    else if (o.mustEscalate && !o.asked) fn++; // 该问，没问 → 漏升级
    else tn++; // 不该问，没问
  }
  // 分母为 0 时约定为 1（没有正预测/没有正样本，视为无错可挑）
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, tn, precision, recall, f1 };
}

/**
 * Fβ：β 控制 recall 相对 precision 的权重。
 * 值班场景漏升级代价高，常取 β=2 让指标更不容忍漏升级。
 */
export function fBeta(precision: number, recall: number, beta: number): number {
  const b2 = beta * beta;
  const denom = b2 * precision + recall;
  return denom === 0 ? 0 : ((1 + b2) * precision * recall) / denom;
}
