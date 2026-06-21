/**
 * src/report.ts —— 打印按档分组的全书来源清单
 * 运行：npm run report
 */
import { SOURCES, TIER_LABEL, type Tier } from './ledger.js';

const order: Tier[] = ['A', 'B', 'C'];

console.log('=== 全书来源台账（按可信度分档）===\n');
for (const tier of order) {
  const rows = SOURCES.filter((s) => s.tier === tier);
  console.log(`【${TIER_LABEL[tier]}】共 ${rows.length} 条`);
  for (const s of rows) {
    console.log(`  - ${s.name}`);
    console.log(`      引用章: ${s.chapters.join(', ')} ｜ 复现: ${s.reproduction}`);
    console.log(`      限定: ${s.caveat}`);
  }
  console.log('');
}

console.log(`合计 ${SOURCES.length} 条来源。`);
