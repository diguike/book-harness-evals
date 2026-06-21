// 平台层 · adapter 接口（与具体 harness、与具体业务都无关）
// 这是评测层唯一的耦合点：平台只认这些接口，不认识任何业务字符串。
// 本文件即全书 adapter 接口的 canonical 定义（StepRecord / AskEvent / RunResult /
// HarnessAdapter / EvalTask / TaskOracle / OtarNode），所有业务层与各章示例都 import 它。

/** 规整后的单步动作记录，与底层框架无关 */
export interface StepRecord {
  id: string;
  kind: 'read' | 'write' | 'thought' | 'escalate'; // read=只读查询，write=写操作
  action: string; // 动作标识，如工具名 'patchConfig'
  args?: unknown; // 调用参数
  result?: unknown; // 工具返回
  ts: number;
}

export interface TaskOracle {
  expectedFinalState?: unknown; // 状态基评分依据（第 7 章）
  mustEscalate?: boolean; // 这次该不该升级（第 13 章，业务真值）
  forbiddenWrites?: string[]; // 不该碰的写操作（安全）
}

export interface EvalTask {
  id: string;
  input: string; // 给 agent 的初始指令
  tier?: 'smoke' | 'core' | 'hard'; // 难度档（第 6 章生成时写入，第 7 章按档聚合）
  initialState?: unknown; // 环境初始态的桩
  oracle?: TaskOracle;
}

// OTAR trace 节点（第 8 章定义，第 11 章反事实 RCA 复用）
// O/T/A/R 四类节点，节点间用 causedBy 连成因果 DAG
export interface OtarNode {
  id: string;
  kind: 'observation' | 'thought' | 'action' | 'result';
  content: unknown;
  causedBy: string[]; // 上游节点 id，构成因果链
  module?: string; // 由哪个 harness 模块产生（归因用）
  ts: number;
}

/** agent 主动停下来问人 / 升级的事件（第 13 章 Ask-F1 用） */
export interface AskEvent {
  id: string;
  kind: 'ask' | 'escalate'; // ask=问澄清，escalate=升级给人类
  question?: string;
  payload?: unknown;
  stepId?: string; // 关联到哪一步（可接入 OTAR 做时机评测）
  ts: number;
}

// 可消融的模块清单（第 9–10 章）
export interface ModuleHandle {
  id: string;
  kind: 'tool' | 'memory' | 'workflow' | 'instruction';
}

// 构造 harness 变体时的配置补丁（第 9 章 withConfig 用）
export interface HarnessConfigPatch {
  disable?: string[];
  replace?: Record<string, unknown>;
}

export interface RunResult {
  taskId: string;
  status: 'success' | 'fail' | 'error';
  finalState: unknown;
  steps: StepRecord[]; // 逐步动作序列（轨迹）
  trace: OtarNode[]; // 结构化因果 trace（第 8 章 OTAR）
  askEvents: AskEvent[]; // agent 主动问人的事件（第 13 章）
  cost: { tokens: number; ms: number };
}

// 全书脊梁接口（writing-kit §4）：评测层唯一的耦合点。
export interface HarnessAdapter {
  name: string;
  run(task: EvalTask, opts?: { seed?: number }): Promise<RunResult>;
  modules(): ModuleHandle[]; // 可消融的模块清单（第 9–10 章）
  withConfig(patch: HarnessConfigPatch): HarnessAdapter; // 构造变体：开/关/替换某模块
}
