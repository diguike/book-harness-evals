// harness-lab/src/adapter.ts —— 评测层与具体 harness 的唯一耦合点。
// 本文件即 canonical adapter 定义——全书 import 来源，以此为准。
// 本章只用到其中 modules() / withConfig() 这两个方法做模块归因。

/** 一个评测任务：给 agent 一段初始指令，附带环境初始态和判定成功的 oracle */
export interface EvalTask {
  id: string;
  input: string; // 给 agent 的初始指令 / 用户消息
  tier?: 'smoke' | 'core' | 'hard'; // 难度档（第 6 章生成时写入，第 7 章聚合按档分层）
  initialState?: unknown; // 环境初始态：日志 / 监控 / 配置的桩
  oracle?: TaskOracle; // 判定成功的依据
}

/** 判定一个任务是否成功的依据，对应本书三条主线 */
export interface TaskOracle {
  expectedFinalState?: unknown; // 状态基评分用：期望的终态（第 7 章）
  mustEscalate?: boolean; // 该不该升级给人（第 13 章）
  forbiddenWrites?: string[]; // 不该碰的高危写操作（安全）
}

/** 一次运行的结果：适配器交给评测层的全部信息 */
export interface RunResult {
  taskId: string;
  status: 'success' | 'fail' | 'error';
  finalState: unknown;
  steps: StepRecord[];
  trace: OtarNode[];
  askEvents: AskEvent[];
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
  causedBy: string[];
  module?: string;
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
  disable?: string[];
  replace?: Record<string, unknown>;
}
