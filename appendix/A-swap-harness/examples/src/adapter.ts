// adapter.ts —— 评测层与具体 harness 的唯一耦合点，全书 adapter 接口的 canonical 定义源。
// 换载体时直接 import 这一份，不要复制改名：接口形状是全书契约。

/** 一个评测任务：给 agent 一段初始指令，附带环境初始态和判定成功的 oracle */
export interface EvalTask {
  id: string;
  input: string; // 给 agent 的初始指令 / 用户消息
  tier?: 'smoke' | 'core' | 'hard'; // 难度档（第 6 章生成时写入，第 7 章聚合按档分层）
  initialState?: unknown; // 环境初始态：日志 / 监控 / 配置的桩
  oracle?: TaskOracle; // 判定成功的依据
}

/** 模拟用户画像：第 14 章评前端形态时驱动一个 LLM 假扮用户 */
export interface UserPersona {
  goal: string; // 这个用户想达成什么
  style: string; // 说话风格（啰嗦 / 暴躁 / 惜字如金……），影响交互轨迹
}

/** 前端形态的任务（第 14 章）：在公共 EvalTask 上扩展一个模拟用户画像 */
export interface FrontendEvalTask extends EvalTask {
  persona: UserPersona; // 模拟用户画像（goal / style）
}

/** 判定一个任务是否成功的依据，对应本书三条主线 */
export interface TaskOracle {
  expectedFinalState?: unknown; // 状态基评分用：期望的终态（第 7 章）
  mustEscalate?: boolean; // 该不该升级给人（第 13 章）
  forbiddenWrites?: string[]; // 不该碰的高危写操作（安全）
}

/** 一次运行的结果：适配器交给评测层的全部信息，评测层只从这里取数据 */
export interface RunResult {
  taskId: string;
  status: 'success' | 'fail' | 'error';
  finalState: unknown; // 终态，状态基评分的输入
  steps: StepRecord[]; // 逐步动作序列（轨迹）
  trace: OtarNode[]; // 结构化因果 trace（第 8 章 OTAR）
  askEvents: AskEvent[]; // agent 主动问人 / 升级的事件（第 13 章）
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

// OTAR：Observation / Thought / Action / Result，节点间用 causedBy 连成因果 DAG（第 8 章详解）。
export interface OtarNode {
  id: string;
  kind: 'observation' | 'thought' | 'action' | 'result';
  content: unknown;
  causedBy: string[]; // 上游节点 id
  module?: string; // 由哪个 harness 模块产生（归因用）
  ts: number;
}

/** 评测层面向的唯一接口：换 harness 只需换一个实现 */
export interface HarnessAdapter {
  name: string;
  run(task: EvalTask, opts?: { seed?: number }): Promise<RunResult>;
  modules(): ModuleHandle[]; // 可消融的模块清单（第 9–10 章）
  withConfig(patch: HarnessConfigPatch): HarnessAdapter; // 构造变体：开 / 关 / 替换某模块
}

/** 一个可被消融的 harness 模块 */
export interface ModuleHandle {
  id: string;
  kind: 'tool' | 'memory' | 'workflow' | 'instruction';
}

/** 构造变体时的补丁：关掉哪些模块、替换哪些模块 */
export interface HarnessConfigPatch {
  disable?: string[]; // 关掉这些模块 id
  replace?: Record<string, unknown>; // 替换某模块的实现 / 配置
}
