# Agent Harness 评测工程

> 用评测建设并守护一个 agent harness——从方法论地基到工程闭环。

这是一本写给应用层工程师的书。它不教你从零造一个评测框架（那是姊妹篇《AI Agent 评测工程实战》干的事），而是回答一个更难的问题：**当你手里已经有一个真实运转的 agent harness——编排、工具、记忆、工作流缝在一起的系统——你怎么知道它到底好不好用、哪个模块在拖后腿、改了一版有没有偷偷劣化？**

全书贯穿一个真实项目：拿现成的 TypeScript agent 框架 [Mastra](https://mastra.ai)，给它配一个「DevOps 值班助手」harness（查日志、查监控、改配置、必要时升级给人类 oncall），再从零给这个 harness 装上一整套评测闭环。读者跟着把评测层一层层建起来，最终得到一个能持续守护 harness 的评测系统。

## 这本书写给谁

适合：

- 已经在搭 agent / harness / skill / 知识库，却不知道怎么证明它真的好用的工程师
- 会跑评测、但还在「改一版靠感觉上线」阶段的团队
- 读过姊妹篇、想从「自建评测框架」进阶到「工程闭环」的读者

不适合：

- 完全没接触过 agent 评测的零基础读者（建议先读姊妹篇《AI Agent 评测工程实战》）
- 只关心模型预训练 / RLHF 机制、不做应用层 harness 的读者
- 想要现成 SaaS 评测平台、不打算自己动手改造 harness 的读者

## 怎么读这本书

- **快速上手**：第 1-2 章建立坐标系和术语，然后直接跳到第 5、7 章把评测层挂上去、跑出第一个整体分。
- **系统学习**：从头顺读。前四章是地基（立论、术语、维度、统计），第二部分把评测装上去，第三部分做模块归因，第四、五部分处理稳定性、人在回路与防劣化闭环。
- **按问题查**：每章解决一个具体痛点（哪个模块拖后腿、该不该打断问人、改完怎么确认没退化），可以挑着读。

## 技术栈

Node.js + TypeScript。每章配套 `examples/`，基于 Mastra，可独立运行。评测层 `harness-lab` 通过适配器与具体 harness 解耦，附录 A 给出更换载体（LangGraph.js / Voltagent）的方法。

## 目录

**第一部分　评测地基：动手前先建立坐标系**

- [第 1 章　评 harness，而不是评模型](book/01-why-harness/README.md)
- [第 2 章　评测方法论术语地图](book/02-eval-vocabulary/README.md)
- [第 3 章　一个 harness 该评哪些维度](book/03-eval-dimensions/README.md)
- [第 4 章　把评测当成统计实验](book/04-eval-as-experiment/README.md)

**第二部分　给 harness 装上评测**

- [第 5 章　外挂评测层：harness-lab 与适配器](book/05-eval-layer-adapter/README.md)
- [第 6 章　评测任务集的构建与防污染](book/06-task-suite-contamination/README.md)
- [第 7 章　harness 整体效果评测](book/07-end-to-end-scoring/README.md)
- [第 8 章　OTAR 结构化因果 trace](book/08-otar-trace/README.md)

**第三部分　模块贡献度归因**

- [第 9 章　消融实验与贡献不可加](book/09-ablation-additivity/README.md)
- [第 10 章　Shapley 模块贡献分账](book/10-shapley-attribution/README.md)
- [第 11 章　反事实根因定位](book/11-counterfactual-rca/README.md)

**第四部分　稳定性、人在回路与形态差异**

- [第 12 章　pass^k 与 flakiness 检测](book/12-passk-flakiness/README.md)
- [第 13 章　人在回路评测与 Ask-F1](book/13-hitl-ask-f1/README.md)
- [第 14 章　前端与服务端的评测分野](book/14-frontend-vs-backend/README.md)

**第五部分　用评测守护并反哺 harness**

- [第 15 章　线上持续评估：影子、A/B 与灰度](book/15-online-shadow-ab/README.md)
- [第 16 章　change manifest 与防劣化闭环](book/16-change-manifest/README.md)
- [第 17 章　评测平台化与业务特化的边界](book/17-platform-vs-bespoke/README.md)

**附录**

- [附录 A　更换 harness 载体](appendix/A-swap-harness/README.md)
- [附录 B　前沿来源与诚实边界](appendix/B-frontier-caveats/README.md)
