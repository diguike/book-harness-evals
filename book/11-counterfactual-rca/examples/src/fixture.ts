import type { OtarNode } from './otar.js';

/**
 * 一条「查对服务、改错字段」的失败 trace，整理成 OTAR 因果图（对应正文场景）。
 *
 * order-api P99 延迟告警 → 值班助手顺着「日志→监控→手册→推理→动作」一路推，
 * 最后把 order-db 的 max_connections 从 50 调到 200，导致 DB OOM、故障升级。
 *
 * 这里直接给整理好的 OtarNode[]（生产里由第 8 章 buildOtar 从真实 RecordedTrace 产出），
 * 无需 API key 即可跑通反事实定位算法。
 */
export const FAILED_TRACE: OtarNode[] = [
  {
    id: 'O1',
    kind: 'observation',
    content: { tool: 'queryLogs', service: 'order-api', finding: '大量"数据库连接等待"告警' },
    causedBy: [],
    module: 'queryLogs',
    ts: 1,
  },
  {
    id: 'T1',
    kind: 'thought',
    content: '瓶颈疑似在 order-db 的连接层，去查 DB 监控',
    causedBy: ['O1'],
    module: 'model',
    ts: 2,
  },
  {
    id: 'O2',
    kind: 'observation',
    content: { tool: 'queryMetrics', service: 'order-db', conn_pool_usage: '100%', max_connections: 50 },
    causedBy: [],
    module: 'queryMetrics',
    ts: 3,
  },
  {
    id: 'O3',
    kind: 'observation',
    content: {
      tool: 'searchRunbook',
      doc: '《连接池打满的应急处理》',
      advice: '临时调大连接池上限可缓解', // ← 在内存敏感实例上这条建议是错的，本例根因
    },
    causedBy: [],
    module: 'searchRunbook',
    ts: 4,
  },
  {
    id: 'T2',
    kind: 'thought',
    // T2 顺着 T1 的方向、采纳了 O2（连接池满）和 O3（手册建议），下了"调大上限"的结论
    content: '连接池打满，按手册调大 max_connections',
    causedBy: ['T1', 'O2', 'O3'],
    module: 'model',
    ts: 5,
  },
  {
    id: 'A1',
    kind: 'action',
    content: { tool: 'patchConfig', service: 'order-db', field: 'max_connections', from: 50, to: 200 },
    causedBy: ['T2'],
    module: 'patchConfig',
    ts: 6,
  },
  {
    id: 'A1:result',
    kind: 'result',
    content: { ok: false, effect: 'order-db OOM 重启，故障从 P2 升级 P1' },
    causedBy: ['A1'],
    module: 'patchConfig',
    ts: 7,
  },
];

/** 失败的终态动作节点 id，反事实定位从它开始回溯 */
export const FAILING_ACTION_ID = 'A1';
