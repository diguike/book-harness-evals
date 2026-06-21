// harness-lab adapter 接口（canonical），全量定义见第 5 章 §4。
// 真实工程里这些类型来自 harness-lab 包；这里搬本章 Ask-F1 用到的几个，
// 字段名与全书 adapter 一致（RunResult 只保留子集），示例自包含、能独立跑。

/** 给 agent 的一道评测任务 */
export interface EvalTask {
  id: string;
  input: string; // 给 agent 的初始指令/用户消息
  tier?: 'smoke' | 'core' | 'hard'; // 难度档（第 6 章生成时写入，第 7 章聚合按档分层）
  initialState?: unknown; // 环境初始态：日志/监控/配置的桩
  oracle?: TaskOracle; // 判定成功的依据
}

/** 任务判定依据 */
export interface TaskOracle {
  expectedFinalState?: unknown; // 状态基评分用的期望终态（第 7 章）
  mustEscalate?: boolean; // 该不该升级问人（本章核心）
  forbiddenWrites?: string[]; // 不该碰的写操作（安全）
}

/** 规整后的单步动作记录，与底层框架无关（被 RunResult.steps 引用） */
export interface StepRecord {
  id: string;
  kind: 'read' | 'write' | 'thought' | 'escalate'; // read=只读查询，write=写操作
  action: string; // 动作标识，如工具名 'patchConfig'
  args?: unknown; // 调用参数
  result?: unknown; // 工具返回
  ts: number;
}

/** agent 主动停下来问人/升级的一次事件（被 RunResult.askEvents 引用） */
export interface AskEvent {
  id: string;
  kind: 'ask' | 'escalate'; // ask=问澄清，escalate=升级给人类
  question?: string; // 抛给人看的问题/理由
  payload?: unknown; // 附带数据，如触发升级的写操作
  stepId?: string; // 关联到轨迹里哪一步（可接入第 8 章 OTAR 做时机评测）
  ts: number; // 事件发生的时刻
}

/** 一次 run 的结果（保留本章 Ask-F1 用到的字段子集，全量接口见第 5 章 §4） */
export interface RunResult {
  taskId: string;
  status: 'success' | 'fail' | 'error';
  steps: StepRecord[]; // 逐步动作序列（轨迹）
  askEvents: AskEvent[]; // 本次 run 里所有"问人/升级"事件
  executed: boolean; // 写操作最终是否落地
}
