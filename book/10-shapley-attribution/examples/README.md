# 第 10 章配套示例：Shapley 模块贡献分账

对五个 harness 模块同时算 **单消融 Δ**（第 9 章）、**精确 Shapley 值**（枚举排列）和**蒙特卡洛 Shapley 近似**，打印分账对照表、可加性核对、缓存效果和近似收敛曲线。

不依赖任何模型 key 即可跑通：coalition value Φ(S) 用一段确定性桩实现，内含可控的冗余 / 互补关系。

## 跑起来

```bash
npm install
npm run shapley      # 跑分账 + 对照 + 收敛曲线
npm run typecheck    # 类型检查
```

## 你会看到什么

- **对照表**：每个模块的单消融 Δ 与精确 / 近似 Shapley φ 并排。
  - 两列相等 = 模块独立（queryMetrics、queryLogs）；
  - Δ 低于 φ = 冗余，单消融低估（searchRunbook、reflection）；
  - Δ 高于 φ = 互补，单消融高估（instructions）。
- **可加性核对**：`Σφ` 严格等于 `Φ(全集) − Φ(∅)`（Shapley 有效性公理）；`ΣΔ` 对不上，证实消融不可加。
- **缓存效果**：精确算法遍历 5! = 120 种排列、调用 phi 720 次，但带缓存后只真正计算 2⁵ = 32 个不同子集。
- **收敛曲线**：蒙特卡洛估计随采样数（50→5000）增加，与精确值的误差单调收窄，印证它是无偏估计。

## 文件结构

| 文件 | 作用 |
|---|---|
| `src/adapter.ts` | 第 5 章 `HarnessAdapter` 接口（全书统一，本章用 `modules()` / `withConfig()`） |
| `src/coalition-value.ts` | Φ(S) 确定性桩 + 带缓存的异步包装；末尾给出换成真实第 7 章 Φ 的最小改法 |
| `src/shapley.ts` | 精确 Shapley（枚举排列）、蒙特卡洛 Shapley（采样 + 标准误差）、可复现 PRNG |
| `src/ablation.ts` | 第 9 章单消融 Δ，用于对照 |
| `src/shapley.run.ts` | 主入口：打印对照表、可加性核对、缓存效果、收敛曲线 |

## 换成真实 harness 评测

把 `coalition-value.ts` 里的确定性桩换成 `makeRealPhi`（文件末尾有注释版）：用 `adapter.withConfig({ disable: 全集 − S })` 构造只装 S 的变体，跑第 7 章的并发回放 + 状态基评分，取整体分点估计作为 Φ(S)。其余算法（精确 / 蒙特卡洛 / 缓存）一行都不用改——这正是面向 `HarnessAdapter` 接口编程的好处。
