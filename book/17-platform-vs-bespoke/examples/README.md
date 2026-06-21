# 第 17 章配套示例：平台层 vs 业务层

把前面各章攒下的评测能力，按"通用机制 vs 业务判断"这条线收口成两层的 `harness-lab`：

```
src/
  platform/        # 平台层：全公司共用，与业务无关
    adapter.ts     # 第 5 章 HarnessAdapter / EvalTask / RunResult / OtarNode 接口
    stats.ts       # 第 4 章 wilsonInterval（开头被复制七遍的那段）
    scoring.ts     # 第 7 章评分引擎 + 第 13 章 Ask-F1 聚合
    reliability.ts # 第 12 章 passHatK / flakiness（接口占位，完整版在第 12 章）
    attribution.ts # 第 9-11 章 ablation / shapley / 反事实（占位）
    trace.ts       # 第 8 章 OtarNode + buildDag 因果 DAG（占位）
    gate.ts        # 第 16 章 change manifest + 选回归（占位）
    hooks.ts       # 业务钩子接口（EscalationPolicy / SuccessPolicy）
  oncall/          # 业务层一：值班助手专属
    adapter.ts     # 接 Mastra（含确定性桩，免 key 可跑）
    tasks.ts       # 值班任务集 + oracle
    policy.ts      # oncallEscalationPolicy（高危写要升级）
  refund/          # 业务层二：电商退款助手（证明换业务只换业务层）
    business.ts
  index.ts         # 组装：平台引擎 + 值班钩子 → 出一份带 CI 的评测报告
  swap-demo.ts     # 同一引擎先跑值班、再跑退款，platform/ 一行不动
```

## 跑

```bash
npm install
npm run demo   # 值班助手评测报告（通过率 + Wilson CI + Ask-F1）
npm run swap   # 换业务演示：同一 platform/ 引擎喂两个不同业务
```

`npm run demo` 默认用 `StubOncallAdapter`（确定性桩），不需要任何 API key 就能跑通。
想接真实 Mastra Agent，把 `index.ts` 里的 `new StubOncallAdapter()` 换成
`buildMastraOncallAdapter()`，并配好模型 key。

## 看点

- 平台引擎 `runSuite`（`platform/scoring.ts`）里没有一个业务专属字符串（如 `patchConfig`）——业务判断全靠 `EscalationPolicy` 钩子注入。
- 换一个完全不同的业务（退款），只换 `oncall/` → `refund/` 这一层，`platform/` 一行不改，`swap-demo.ts` 证明了这一点。
- 线划对了，业务的增长就不会反过来侵蚀平台。
