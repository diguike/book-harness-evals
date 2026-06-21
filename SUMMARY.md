# 目录

> 《Agent Harness 评测工程》完整目录。本文件作为发布工具链（飞书同步、inferloop-site sync）的目录数据源，与 README 内联目录保持同步。

- [前言](preface/README.md)

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
