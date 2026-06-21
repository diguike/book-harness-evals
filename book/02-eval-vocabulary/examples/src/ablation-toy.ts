// 玩具版消融：Δi = Φ(H) − Φ(H−i)，并演示各 Δi 不可加（ΣΔi ≠ 整体提升）
//
// 用一个手写的"整体效果函数" Φ 模拟值班助手的三个模块：
//   logs  —— 查日志工具
//   book  —— 查 runbook 工具
//   flow  —— 判断该不该升级的工作流
// Φ 故意带交互项，正是真实 harness 里"模块协同/冗余"的来源。

type ModuleId = 'logs' | 'book' | 'flow';
const ALL: ModuleId[] = ['logs', 'book', 'flow'];

/**
 * 整体效果指标 Φ(H)：给定开启的模块集合，返回一个成功率（0~1）。
 * 关键在交互项：book 和 flow 单独都只值一点点，但俩一起在时有明显协同加成。
 */
function phi(active: Set<ModuleId>): number {
  let score = 0.3; // 空配置也能蒙对一些
  if (active.has('logs')) score += 0.2; // 查日志：独立贡献
  if (active.has('book')) score += 0.05; // 查 runbook：单独贡献很小
  if (active.has('flow')) score += 0.05; // 升级工作流：单独贡献也很小
  // 交互项：book + flow 必须协同——查到手册 + 据手册决定升级，才真正兜住高危操作
  if (active.has('book') && active.has('flow')) score += 0.25;
  return Math.min(1, score);
}

/** 关掉单个模块 i，算它的消融贡献 Δi */
function ablationDelta(full: Set<ModuleId>, i: ModuleId): number {
  const minusI = new Set(full);
  minusI.delete(i);
  return phi(full) - phi(minusI);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const full = new Set<ModuleId>(ALL);
  const empty = new Set<ModuleId>();

  const phiFull = phi(full);
  const phiEmpty = phi(empty);

  console.log('Φ(完整 harness) =', phiFull.toFixed(3));
  console.log('Φ(空配置)       =', phiEmpty.toFixed(3));
  console.log('整体提升         =', (phiFull - phiEmpty).toFixed(3));

  console.log('\n逐模块消融 Δi = Φ(H) − Φ(H−i):');
  let sumDelta = 0;
  for (const i of ALL) {
    const d = ablationDelta(full, i);
    sumDelta += d;
    console.log(`  Δ(${i}) = ${d.toFixed(3)}`);
  }

  console.log('\nΣΔi          =', sumDelta.toFixed(3));
  console.log('整体提升      =', (phiFull - phiEmpty).toFixed(3));
  console.log(
    `\n结论：ΣΔi (${sumDelta.toFixed(3)}) ≠ 整体提升 (${(phiFull - phiEmpty).toFixed(3)})。` +
      '\nbook 和 flow 的交互被双重计入，消融 Δ 不可加——这正是第 10 章需要 Shapley 公平分账的理由。',
  );
}
