# 第 16 章配套代码：change manifest 与防劣化闭环

把一次 harness 改动声明成一份 change manifest，据它选回归子集，跑新旧两版做状态基评分，
再用显著性门禁裁决放行还是回滚。整条闭环不依赖模型 key，用 `MockOncallAdapter` 确定性回放。

## 跑起来

```bash
npm install
npm run gate        # 跑两个场景：一个好改动、一个坏改动
npm run typecheck   # 类型检查
```

## 你会看到什么

`npm run gate` 连跑两个 manifest：

- **PR-482-放宽边界（好改动）**：把升级阈值放宽到含等于，修好了 `auth` 这条边界任务。
  但回归子集只有 8 条，单条修复的涨幅（+0.125）过不了显著性（p≈0.30）——裁决
  `PASS_NO_GAIN`：放行，但不准声称"确有改进"。这是想让你看清：改对了不等于测得出改对了。
- **PR-501-调高阈值（坏改动）**：有人把阈值粗心调高，`cart` 不再升级，从 pass 翻成 FAIL。
  manifest 当初只预测"不影响既有判定"，根本没料到会碰翻 cart——但独立回归子集兜住了它，
  裁决 `ROLLBACK`，进程以非零码退出（CI 据此判红）。

第二个场景对应调研里的一条警示：harness 几乎预测不了自己的回归，门禁不能靠 manifest 自报，
必须有独立回归集兜底。

## 文件

| 文件 | 作用 |
|---|---|
| `manifest.ts` | change manifest schema（zod）+ 据 manifest 选回归子集 |
| `gate.ts` | 门禁主流程：选子集 → 跑新旧两版 → 显著性裁决 → 放行/回滚（入口） |
| `task-suite.ts` | 带 `touches` 标签的值班任务集，标注每条任务经过哪些模块 |
| `stats.ts` | Wilson 区间 + 双比例 z 检验 + Bonferroni 门槛（第 4 章工具箱） |
| `state-scorer.ts` | 状态基评分（第 7 章），比对终态与 oracle |
| `adapter.ts` / `world.ts` / `oncall-tools.ts` / `mastra-adapter.ts` / `mock-adapter.ts` | harness-lab 评测层与适配器，本章直接复用。其中 `adapter.ts` 的接口（`EvalTask` / `StepRecord` / `AskEvent` / `RunResult` / `HarnessAdapter` 等）由第 5 章首次定义，是全书 canonical 真相源；`world.ts` / `oncall-tools.ts` / `mock-adapter.ts` / `mastra-adapter.ts` 的值班世界与适配器实现由第 5、7 章首次给出 |

把 `gate.ts` 里的 `MockOncallAdapter` 换成 `MastraOncallAdapter`（`mastra-adapter.ts`），
配上模型 key，就是对真 agent 跑同一套门禁。
