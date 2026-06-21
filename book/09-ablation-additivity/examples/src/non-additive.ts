// non-additive.ts —— 用一个带冗余惩罚的效用函数，最小化复现“Δi 不可加”。
//
// 和 run-ablation.ts 不同：那边跑的是真任务集 + 状态基评分，这里只用一个
// 解析式的效用函数 Φ(S)，把“模块能力重叠 → 冗余 → 不可加”这件事剥到最干净，
// 方便你改一个系数就看缺口怎么变。
//
// 设三个能力部分重叠的模块（记忆 / 工具 / middleware）。
// 单模块“单独测”的增益 solo[i] = 该模块独自在场相对空 harness 的提升；
// 三个一起上时，每有“两个同时在场”就因为能力重叠扣掉一份冗余惩罚 redundancy。
// Φ(空集) = 0，Φ(S) = Σ_{i∈S} solo[i] − redundancy × (S 中的模块对数)。

const modules = ['memory', 'tools', 'middleware'] as const;
type Mod = (typeof modules)[number];

// 各模块“单独测”的增益（百分点）：solo[i] = Φ({i}) − Φ({})
const solo: Record<Mod, number> = {
  memory: 5.6,
  tools: 3.3,
  middleware: 2.2,
};

// 每对“同时在场”的模块因能力重叠扣掉的冗余惩罚（百分点）。改这个数看缺口怎么变。
const redundancy = 1.3;

/** 子集 S 上的效用：单独增益相加，再按 S 内的模块对数扣冗余 */
function utility(present: Mod[]): number {
  const base = present.reduce((sum, m) => sum + solo[m], 0);
  const pairs = (present.length * (present.length - 1)) / 2;
  return base - redundancy * pairs;
}

const full = modules.slice();
const phiFull = utility(full); // 三个一起上
const phiEmpty = utility([]); // 全关 = 0

const sumSolo = modules.reduce((a, m) => a + solo[m], 0); // 三个单独增益相加
const wholeGain = phiFull - phiEmpty; // 三个一起上相对空 harness 的整合结果

console.log('=== 带冗余惩罚的最小效用模型 ===\n');
console.log(`冗余惩罚系数 redundancy = ${redundancy}（每对同时在场的模块扣这么多）\n`);

console.log('--- 单模块“单独测”的增益 solo[i] = Φ({i}) − Φ({}) ---');
for (const m of modules) {
  console.log(`  solo(${m.padEnd(11)}) = +${solo[m].toFixed(1)}`);
}

console.log('\n--- 可加性检验 ---');
console.log(`  Σsolo（三个单独增益相加）   = +${sumSolo.toFixed(1)}`);
console.log(`  整合结果（三个一起上）       = +${wholeGain.toFixed(1)}`);
console.log(
  `  缺口 = Σsolo − 整合结果      = ${(sumSolo - wholeGain).toFixed(1)}  <- 三者两两之间被重复计的冗余`,
);
