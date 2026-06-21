// harness-lab/src/adapter.ts —— 评测层与具体 harness 的唯一耦合点（第 5 章定义）。
// EvalTask / RunResult / StepRecord / AskEvent / OtarNode 等字段名和形状是全书 canonical 口径，
// 与第 5 章及其余各章逐字一致。本章在公共 EvalTask 之上扩展出 FrontendEvalTask，
// 给前端轨的 LLM 模拟用户带上一份 persona（服务端轨用公共 EvalTask 即可）。

/** 一个评测任务（公共形状，第 5 章定义） */
export interface EvalTask {
  id: string;
  input: string; // 服务端轨：初始指令；前端轨：模拟用户开场第一句
  tier?: 'smoke' | 'core' | 'hard'; // 难度档（第 6 章生成时写入，第 7 章按档聚合）
  initialState?: unknown; // 环境初始态：日志 / 监控 / 配置的桩
  oracle?: TaskOracle; // 判定成功的依据
}

/** 前端形态的任务（第 14 章）：在公共 EvalTask 上扩展一个模拟用户画像 */
export interface FrontendEvalTask extends EvalTask {
  persona: UserPersona; // 模拟用户画像（goal / style），前端轨必填
}

/** 判定一个任务是否成功的依据 */
export interface TaskOracle {
  expectedFinalState?: Partial<WorldStateLike>; // 状态基评分用：期望的终态（第 7 章）
  mustEscalate?: boolean; // 该不该升级给人（第 13 章）
  forbiddenWrites?: string[]; // 不该碰的高危写操作（安全）
}

/** 前端轨模拟用户的人设：目标 + 风格 */
export interface UserPersona {
  goal: string; // 用户想达成什么
  style: string; // 说话风格（简短 / 不主动给细节 等）
}

/** 一次运行的结果：评测层只从这里取数据 */
export interface RunResult {
  taskId: string;
  status: 'success' | 'fail' | 'error';
  finalState: WorldStateLike; // 终态，状态基评分的输入
  steps: StepRecord[]; // 逐步动作序列（轨迹）
  trace: OtarNode[]; // 结构化因果 trace（第 8 章 OTAR）
  askEvents: AskEvent[]; // agent 主动问人 / 升级的事件（第 13 章）
  transcript: Turn[]; // 前端轨（第 14 章）扩展，服务端 adapter 可置空数组（judge 的输入）
  cost: { tokens: number; ms: number };
}

/** 规整后的单步动作记录，与底层框架无关 */
export interface StepRecord {
  id: string;
  kind: 'read' | 'write' | 'thought' | 'escalate'; // read=只读查询，write=写操作
  action: string; // 动作标识，如工具名 'patchConfig'
  args?: unknown; // 调用参数
  result?: unknown; // 工具返回
  ts: number;
}

/** agent 主动停下来问人 / 升级的事件 */
export interface AskEvent {
  id: string;
  kind: 'ask' | 'escalate'; // ask=问澄清，escalate=升级给人类
  question?: string;
  payload?: unknown;
  stepId?: string; // 关联到哪一步（可接入 OTAR 做时机评测）
  ts: number;
}

/** 一轮对话：谁说的、说了什么 */
export interface Turn {
  role: 'user' | 'agent';
  text: string;
}

// OTAR：Observation / Thought / Action / Result（第 8 章详解）。
export interface OtarNode {
  id: string;
  kind: 'observation' | 'thought' | 'action' | 'result';
  content: unknown;
  causedBy: string[];
  module?: string;
  ts: number;
}

/** 评测层面向的唯一接口：换 harness 只需换一个实现 */
export interface HarnessAdapter {
  name: string;
  run(task: EvalTask, opts?: { seed?: number }): Promise<RunResult>;
  modules(): ModuleHandle[];
  withConfig(patch: HarnessConfigPatch): HarnessAdapter;
}

export interface ModuleHandle {
  id: string;
  kind: 'tool' | 'memory' | 'workflow' | 'instruction';
}

export interface HarnessConfigPatch {
  disable?: string[];
  replace?: Record<string, unknown>;
}

/** 环境状态形状（前后端两轨共用同一份世界） */
export interface WorldStateLike {
  configs: Record<string, string>; // 当前配置（patchConfig 改这里）
  escalated: boolean; // 是否已升级给人
  logs: string[]; // 只读日志桩
  metrics: Record<string, number>; // 只读监控桩
}

/** 一个 agent 动作（离线步级匹配用） */
export interface AgentAction {
  tool: string; // 工具 id
  args?: Record<string, unknown>; // 关键参数
}
