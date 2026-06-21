// pass@k vs pass^k：agent 评测要盯的是 pass^k（每次都成），不是 pass@k（至少成一次）

/** pass@k：k 次里至少成功一次的概率。乐观，衡量能力上界 */
export function passAtK(p: number, k: number): number {
  return 1 - Math.pow(1 - p, k);
}

/** pass^k：k 次全部成功的概率。悲观，衡量可靠性 */
export function passHatK(p: number, k: number): number {
  return Math.pow(p, k);
}

/**
 * 蒙特卡洛模拟一个会抖动的多步任务：
 * 一条任务由 steps 步组成，每步独立成功率 stepP，全部成功才算这条任务成功。
 * 多步任务的整体可靠性就是 pass^steps，随步数指数级下滑。
 */
function simulateMultiStepTask(
  stepP: number,
  steps: number,
  trials: number,
): number {
  let passed = 0;
  for (let t = 0; t < trials; t++) {
    let allOk = true;
    for (let s = 0; s < steps; s++) {
      if (Math.random() > stepP) {
        allOk = false; // 任意一步崩了，整条任务就废
        break;
      }
    }
    if (allOk) passed++;
  }
  return passed / trials;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = 0.9; // 单次成功率
  console.log('单次成功率 p =', p);
  for (const k of [1, 3, 5, 10]) {
    console.log(
      `k=${k}: pass@${k}=${passAtK(p, k).toFixed(3)} (乐观)  ` +
        `pass^${k}=${passHatK(p, k).toFixed(3)} (悲观/真实可靠性)`,
    );
  }

  console.log('\n蒙特卡洛：值班助手"连续改 N 步配置"任务，每步成功率 0.9');
  const trials = 20000;
  for (const steps of [1, 3, 5]) {
    const empirical = simulateMultiStepTask(0.9, steps, trials);
    const theory = passHatK(0.9, steps);
    console.log(
      `${steps} 步任务: 模拟成功率 ${empirical.toFixed(3)} ≈ ` +
        `理论 pass^${steps} ${theory.toFixed(3)}`,
    );
  }

  console.log(
    '\n结论：3 步全过的概率只剩 0.729——pass@k 看着完美，pass^k 才是改生产配置时该认的数。',
  );
}
