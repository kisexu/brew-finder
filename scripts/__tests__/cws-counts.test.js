import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageCounts, checkPackageGrowth, publishedCounts } from '../cws-counts.js';

describe('published package count gate', () => {
  it.each([-1, 0, 4, 5, 6])('requires at least five net new packages: %i', delta => {
    const baseline = { versions: ['0.1.0.2'], formulaCount: 8729, caskCount: 7828, total: 16557 };
    const result = checkPackageGrowth(baseline, { formulaCount: 8729 + delta, caskCount: 7828 });
    expect(result.skipped).toBe(delta < 5);
    expect(result.increase).toBe(delta);
    expect(result.published.total).toBe(16557);
  });
  it('rejects missing or invalid counts rather than treating them as zero', () => {
    expect(() => packageCounts({ formulaCount: 10 })).toThrow();
    expect(() => packageCounts({ formulaCount: -1, caskCount: 2 })).toThrow();
  });
  it('uses published channels, never an unapproved submission, and fails closed without a baseline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cws-counts-'));
    const name = 'publishers/test/items/test';
    const status = { name, publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '0.1.0.1' }, { crxVersion: '0.1.0.2' }] }, submittedItemRevisionStatus: { state: 'PENDING_REVIEW', distributionChannels: [{ crxVersion: '0.1.0.3' }] } };
    try {
      await expect(publishedCounts(directory, status)).rejects.toThrow('缺少已发布版本');
      for (const [version, formulaCount] of [['0.1.0.1', 1000], ['0.1.0.2', 1005], ['0.1.0.3', 2000]]) {
        await writeFile(join(directory, `release-${version}.json`), JSON.stringify({ name, version, phase: 'submitted', counts: { formulaCount, caskCount: 1000 } }));
      }
      expect(await publishedCounts(directory, status)).toMatchObject({ total: 2005, versions: ['0.1.0.1', '0.1.0.2'] });
      expect(JSON.parse(await readFile(join(directory, 'published.json'))).total).toBe(2005);
      await expect(publishedCounts(directory, { ...status, name: 'different-publisher' })).rejects.toThrow('缺少已发布版本');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

});
