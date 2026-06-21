// 升级策略：决定一个写操作该不该停下来问人。
//
// 这里用规则实现，方便无需 API key 就能确定性地跑通整章评测。
// 真实 harness 里可以换成"模型结合上下文判断 + 规则兜底"，
// 评测层不关心内部实现，只看每道任务上的最终决策对不对
// （详见正文「在 harness 里把"问人"做成可挂起的环节」一节）。

export interface WriteInput {
  action: string; // 写操作类型，如 patchConfig / restartService
  args: Record<string, unknown>;
}

export interface EscalationDecision {
  shouldAsk: boolean; // 是否升级问人
  reason: string; // 抛给人类 oncall 的理由
}

/** 命中即视为高危、必须升级的配置键 */
const HIGH_RISK_CONFIG_KEYS = ['db.pool.max', 'db.pool.min', 'replica.count'];

/** 命中即视为高危、必须升级的服务（重启它们影响面大） */
const CORE_SERVICES = ['payment-gateway', 'order-service', 'auth-service'];

/**
 * 默认升级策略（baseline）。
 * 改这里的规则，就能观察 precision / recall 怎么此消彼长。
 */
export function decideEscalation(input: WriteInput): EscalationDecision {
  // 重启核心服务：必须叫人
  if (input.action === 'restartService') {
    const svc = String(input.args.service ?? '');
    if (CORE_SERVICES.includes(svc)) {
      return { shouldAsk: true, reason: `重启核心服务 ${svc}，影响面大，需人工确认` };
    }
    return { shouldAsk: false, reason: '' };
  }

  // 改高危配置键、或大幅收缩资源：必须叫人
  if (input.action === 'patchConfig') {
    const key = String(input.args.key ?? '');
    if (HIGH_RISK_CONFIG_KEYS.includes(key)) {
      const from = Number(input.args.from);
      const to = Number(input.args.to);
      // 收缩超过一半视为高危
      if (Number.isFinite(from) && Number.isFinite(to) && to < from / 2) {
        return { shouldAsk: true, reason: `${key} 从 ${from} 收缩到 ${to}，幅度过大，需人工确认` };
      }
      return { shouldAsk: true, reason: `${key} 属高危配置，需人工确认` };
    }
    return { shouldAsk: false, reason: '' };
  }

  // 其余写操作（清理临时文件、调日志级别等）视为低危，自主处理
  return { shouldAsk: false, reason: '' };
}

/**
 * 一个故意"太敏感"的策略变体：任何写操作都升级。
 * 跑评测时切到它，会看到 precision 暴跌（过度打断），recall 升到 1。
 * 用于演示 Ask-F1 如何同时抓住两头。
 */
export function decideEscalationOverCautious(input: WriteInput): EscalationDecision {
  return { shouldAsk: true, reason: `对 ${input.action} 一律升级（over-cautious 变体）` };
}
