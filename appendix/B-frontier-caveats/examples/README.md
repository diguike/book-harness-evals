# 附录 B 配套：来源台账 + 诚实边界校验 + “不可加”复现

把全书引用过的前沿来源做成一份可查询、可校验的结构化台账，并用最小代码复现“模块贡献不可加”这条贯穿全书的诚实边界。

## 文件

- `src/ledger.ts` —— 全书来源台账（每条带 tier A/B/C、复现状态、引用章号、引用限定）+ `lintLedger` 校验逻辑（C 档前沿来源必须带 caveat 与复现状态）+ `tierOf()` 按 id 查档位。
- `src/non-additive.ts` —— 带交互项的玩具效用函数，复现单模块 ΣΔi ≠ 整体增益。
- `src/report.ts` —— 按三档分组打印来源清单。
- `src/verify.ts` —— 跑台账 lint + “不可加”复现，可放进 CI（有问题以非零退出码失败）。

## 怎么跑

```bash
npm install
npm run report    # 打印按档分组的全书来源清单
npm run verify    # 诚实边界 lint + 复现“模块贡献不可加”
npm run typecheck # 类型检查
```

`npm run verify` 预期输出：台账 lint 通过（所有 C 档来源都带 caveat 与复现状态），并打印出 ΣΔi（11.1pp）≠ 整体增益（7.2pp），差额（约 3.9pp）即被相加吞掉的交互（冗余）项。

## 对照正文

- 三档分流图 → 正文“三档可信度”一节。
- `lintLedger` → 正文“引用纪律落到代码”一节；把诚实边界做成 CI 检查。
- `non-additive.ts` → 正文“不可加教训的最小复现”一节，呼应第 9 章（消融 Δ 不可加）、第 10 章（Shapley 分账）。
