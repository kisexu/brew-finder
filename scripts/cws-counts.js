import { readFile, writeFile, rename, readdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export function packageCounts(metadata) {
  for (const key of ['formulaCount', 'caskCount']) {
    if (!Number.isSafeInteger(metadata?.[key]) || metadata[key] < 0) throw new Error('包数量记录缺失或无效');
  }
  return { formulaCount: metadata.formulaCount, caskCount: metadata.caskCount, total: metadata.formulaCount + metadata.caskCount };
}

export function checkPackageGrowth(published, metadata) {
  const candidate = packageCounts(metadata);
  const increase = candidate.total - published.total;
  return { skipped: increase < 5, reason: increase < 5 ? '包数量净增不足 5 个' : '包数量净增达到门槛', published, candidate, increase, minimumIncrease: 5 };
}

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export async function writeRecord(path, record) {
  await writeFile(`${path}.tmp`, JSON.stringify(record, null, 2), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

// Only records tied to an actual upload and the store's published version qualify.
export async function publishedCounts(directory, status, previous) {
  const revision = status.publishedItemRevisionStatus;
  if (revision?.state !== 'PUBLISHED' || !revision.distributionChannels?.length) throw new Error('缺少当前已发布版本，无法确定包数量基线');
  const versions = [...new Set(revision.distributionChannels.map(channel => channel.crxVersion))];
  const records = [];
  for (const version of versions) {
    if (!/^\d+(\.\d+){0,3}$/.test(version)) throw new Error('无效商店版本');
    let record;
    try { record = await readJson(join(directory, `release-${version}.json`)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!record && previous?.name === status.name && previous.version === version && ['uploaded', 'submitted'].includes(previous.phase)) {
      // Migrate releases made before package counts were stored in the journal.
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith('build-')) continue;
        const folder = join(directory, entry.name);
        let artifact;
        try { artifact = await readJson(join(folder, 'artifact.json')); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (artifact.version !== version || artifact.zipSha256 !== previous.zipSha256) continue;
        const zipPath = join(folder, `brew-finder-${version}.zip`);
        const digest = createHash('sha256').update(await readFile(zipPath)).digest('hex');
        if (digest !== previous.zipSha256) throw new Error('已发布产物 ZIP 哈希不一致');
        const manifest = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }));
        if (manifest.version !== version) throw new Error('已发布产物版本不一致');
        const metadata = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'data/metadata.json'], { encoding: 'utf8' }));
        record = { ...previous, counts: packageCounts(metadata) };
        await writeRecord(join(directory, `release-${version}.json`), record);
        break;
      }
    }
    if (!record || record.name !== status.name || record.version !== version || !['uploaded', 'submitted'].includes(record.phase)) {
      throw new Error(`缺少已发布版本 ${version} 的包数量记录；请恢复对应发布记录及产物，禁止使用最新数据替代基线`);
    }
    records.push({ version, ...packageCounts(record.counts) });
  }
  // During a phased rollout, require growth against every published channel.
  const largest = records.reduce((a, b) => a.total >= b.total ? a : b);
  const published = { name: status.name, versions, channels: records, ...packageCounts(largest), observedAt: new Date().toISOString() };
  await writeRecord(join(directory, 'published.json'), published);
  return published;
}

export async function recordGrowthCheck(directory, name, version, published, metadata) {
  const result = { name, version, checkedAt: new Date().toISOString(), ...checkPackageGrowth(published, metadata) };
  await appendFile(join(directory, 'package-checks.jsonl'), `${JSON.stringify(result)}\n`, { mode: 0o600 });
  return result;
}
