// 平台层 · 第 4 章统计机制（纯通用：只关心 n 次里成功 k 次，与业务无关）
// 这正是开头被复制了七遍、最该沉淀进平台的那类代码

/** 二项比例的 Wilson 置信区间。给定成功数 k / 总数 n，返回 [下界, 上界] */
export function wilsonInterval(
  k: number,
  n: number,
  z = 1.96, // 95% 置信
): { lower: number; upper: number; point: number } {
  if (n === 0) return { lower: 0, upper: 1, point: 0 };
  const phat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return {
    lower: Math.max(0, (center - margin) / denom),
    upper: Math.min(1, (center + margin) / denom),
    point: phat,
  };
}
