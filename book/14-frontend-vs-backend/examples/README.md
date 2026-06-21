# 第 14 章配套示例：前端与服务端的评测分野

同一组 DevOps 值班任务，用两条轨评：

- **服务端轨**：封闭批跑（`backend-adapter.ts`）+ 状态基评分（`state-scorer.ts`），确定、可回放、每次提交进 CI。
- **前端轨**：LLM 模拟用户（`user-simulator.ts`）驱动前端面板形态（`frontend-adapter.ts`），多轮交互；在线用 judge 评交互质量（`interaction-judge.ts`），离线用步级匹配做 CI 哨兵（`offline-step-match.ts`）。

两轨共用同一套工具（`oncall-tools.ts`）、同一个决策 brain（`oncall-brain.ts`）、同一套 `HarnessAdapter` 接口（`adapter.ts`）——前端这副新面孔没有逼评测层改接口。

## 跑

```bash
npm install
npm run compare      # 默认 mock 模拟用户，不需要任何模型 key
npm run typecheck    # 类型检查
```

会打印：服务端状态基分（带 Wilson CI）、前端在线 judge 均分 + pass^K、前端离线步级匹配分。三个数分开报，不揉成一个加权总分。

## 切到真模型

```bash
USE_REAL_MODEL=1 OPENAI_API_KEY=sk-... npm run compare
```

此时模拟用户换成真的 Mastra `Agent`（`user-simulator.ts` 里的 `buildRealUserSimulator`），交互 judge 换成基于 `createScorer` 的真 LLM judge（`interaction-judge.ts` 里的 `buildLlmInteractionJudge`）。模型 id 默认 `'openai/gpt-4.1'`，按需改成你实际在用的。

## 文件导览

| 文件 | 作用 |
|---|---|
| `adapter.ts` | `harness-lab` 评测层接口（第 5 章形状，加了前端轨用的 `persona`/`transcript`） |
| `world.ts` | 隔离环境 + 动作/对话留痕 |
| `oncall-tools.ts` | 值班工具集（前后端共用） |
| `oncall-brain.ts` | agent 侧决策（确定性脚本替代模型，可换真 Agent） |
| `user-simulator.ts` | LLM 模拟用户（mock + 真模型两条路） |
| `frontend-adapter.ts` | 前端面板适配器：把整轮对话塞进 `run()` |
| `backend-adapter.ts` | 服务端批处理适配器：封闭一把跑完 |
| `state-scorer.ts` | 状态基评分（服务端轨） |
| `interaction-judge.ts` | 交互质量 judge（前端在线轨） |
| `offline-step-match.ts` | 离线步级匹配（前端离线轨，一步多 gold） |
| `task-suite.ts` | 贯穿两轨的任务集 + 离线步数据 |
| `stats.ts` | Wilson 区间 |
| `compare.ts` | 双轨对照入口 |
