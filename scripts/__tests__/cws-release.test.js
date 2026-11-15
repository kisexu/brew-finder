import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { configuration, compareVersions, guardStatus, releaseToStore, createTransport, createApi } from '../cws-api.js';
import { main, packageExtension, withLock, nextBuildNumber } from '../cws-release.js';
import { createBuildArtifacts } from '../build-maps.js';

const name = 'publishers/test/items/kjcbapmmfbemenipkkbiblaifanjljbo';
const artifact = { version: '0.1.0.2', zipSha256: 'hash' };
const status = { name, publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '0.1.0.1' }] } };
function setup() {
  const api = {
    name, publishType: 'STAGED_PUBLISH', status: vi.fn().mockResolvedValue(status),
    upload: vi.fn().mockResolvedValue({ name, uploadState: 'SUCCEEDED', crxVersion: artifact.version }),
    publish: vi.fn().mockResolvedValue({ name, state: 'PENDING_REVIEW' }),
  };
  return { api, artifact, zip: Buffer.from('zip'), submit: true, save: vi.fn(), wait: vi.fn() };
}

describe('local CWS release', () => {
  it('uses V2 binary upload and JSON publish without leaking transport errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name }) });
    const api = createTransport({ name, publishType: 'STAGED_PUBLISH' }, async () => 'fake-token', fetchImpl);
    await api.status();
    await api.upload(Buffer.from('ZIP'));
    await api.publish({ publishType: 'STAGED_PUBLISH' });
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://chromewebstore.googleapis.com/v2/${name}:fetchStatus`);
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
    expect(fetchImpl.mock.calls[1][0]).toBe(`https://chromewebstore.googleapis.com/upload/v2/${name}:upload`);
    expect(fetchImpl.mock.calls[1][1].body).toEqual(Buffer.from('ZIP'));
    expect(fetchImpl.mock.calls[2][1].body).toBe('{"publishType":"STAGED_PUBLISH"}');
    fetchImpl.mockRejectedValue(new Error('fake-token private-key detail'));
    await expect(api.status()).rejects.toThrow('fetchStatus 请求失败或结果不确定');
    const authFailure = createTransport({ name }, async () => { throw new Error('secret'); }, fetchImpl);
    await expect(authFailure.status()).rejects.toThrow('凭据详情已隐藏');
  });
  it('rejects credentials inside the repository before authentication', async () => {
    await expect(createApi(process.cwd(), { CWS_PUBLISHER_ID: 'test', GOOGLE_APPLICATION_CREDENTIALS: 'package.json' })).rejects.toThrow('仓库外');
  });
  it('defaults to staged and supports explicit default publishing', () => {
    expect(configuration({ CWS_PUBLISHER_ID: 'test' }).publishType).toBe('STAGED_PUBLISH');
    expect(configuration({ CWS_PUBLISHER_ID: 'test', CWS_PUBLISH_TYPE: 'DEFAULT_PUBLISH' }).publishType).toBe('DEFAULT_PUBLISH');
    expect(() => configuration({ CWS_PUBLISHER_ID: 'test', CWS_PUBLISH_TYPE: 'typo' })).toThrow();
  });
  it('uploads then submits with review and warnings enforced', async () => {
    const options = setup();
    await releaseToStore(options);
    expect(options.api.publish).toHaveBeenCalledWith({ publishType: 'STAGED_PUBLISH', skipReview: false, blockOnWarnings: true });
    expect(options.save.mock.calls.map(([s]) => s.phase)).toEqual(['uploading', 'uploaded', 'submitting', 'submitted']);
    expect(options.api.status).toHaveBeenCalledTimes(2);
  });
  it('upload mode never publishes', async () => {
    const options = setup();
    await releaseToStore({ ...options, submit: false });
    expect(options.api.publish).not.toHaveBeenCalled();
  });
  it.each(['PENDING_REVIEW', 'STAGED', 'ITEM_STATE_UNSPECIFIED'])('blocks existing %s before upload', async state => {
    const options = setup();
    options.api.status.mockResolvedValue({ ...status, submittedItemRevisionStatus: { state } });
    await expect(releaseToStore(options)).rejects.toThrow('已有提交');
    expect(options.api.upload).not.toHaveBeenCalled();
    expect(options.api.publish).not.toHaveBeenCalled();
  });
  it('rechecks for concurrent staged revision before publishing', async () => {
    const options = setup();
    options.api.status.mockResolvedValueOnce(status).mockResolvedValue({ ...status, submittedItemRevisionStatus: { state: 'STAGED' } });
    await expect(releaseToStore(options)).rejects.toThrow();
    expect(options.api.publish).not.toHaveBeenCalled();
  });
  it.each(['upload', 'publish'])('queries after %s timeout and never retries writes', async method => {
    const options = setup();
    options.api[method].mockRejectedValue(new Error('timeout with secret'));
    await expect(releaseToStore(options)).rejects.toThrow('结果不确定');
    expect(options.api[method]).toHaveBeenCalledTimes(1);
    expect(options.api.status).toHaveBeenCalledTimes(method === 'upload' ? 2 : 3);
    expect(options.save.mock.calls.at(-1)[0].phase).toBe('uncertain');
    if (method === 'upload') expect(options.api.publish).not.toHaveBeenCalled();
  });
  it('blocks resume of uncertain writes even if the server looks idle', async () => {
    const options = setup();
    await expect(releaseToStore({ ...options, previous: { phase: 'uploading' } })).rejects.toThrow('禁止自动重试');
    expect(options.api.upload).not.toHaveBeenCalled();
  });
  it('polls an acknowledged async upload before submitting', async () => {
    const options = setup();
    options.api.upload.mockResolvedValue({ name, uploadState: 'IN_PROGRESS' });
    options.api.status.mockResolvedValueOnce(status)
      .mockResolvedValueOnce({ ...status, lastAsyncUploadState: 'IN_PROGRESS' })
      .mockResolvedValueOnce({ ...status, lastAsyncUploadState: 'SUCCEEDED' })
      .mockResolvedValue(status);
    await releaseToStore(options);
    expect(options.api.upload).toHaveBeenCalledTimes(1);
    expect(options.wait).toHaveBeenCalledTimes(2);
    expect(options.api.publish).toHaveBeenCalledTimes(1);
  });
  it.each(['IN_PROGRESS', 'FAILED'])('does not submit unconfirmed %s uploads', async uploadState => {
    const options = setup();
    options.api.upload.mockResolvedValue({ name, uploadState });
    await expect(releaseToStore(options)).rejects.toThrow('停止送审');
    expect(options.api.publish).not.toHaveBeenCalled();
  });
  it('checks versions numerically against all store channels', () => {
    expect(compareVersions('0.1.0.10', '0.1.0.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0.0')).toBe(0);
    expect(() => guardStatus(status, '0.1.0.1')).toThrow('必须高于');
    expect(() => guardStatus({ ...status, publishedItemRevisionStatus: { state: 'PUBLISHED' } }, artifact.version)).toThrow('缺失');
  });
  it('auto stops before building when a revision is in review', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cws-auto-'));
    const { api } = setup();
    const buildExtension = vi.fn();
    api.status.mockResolvedValue({ ...status, submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } });
    try {
      await writeFile(join(root, 'package.json'), '{"version":"0.1.0"}');
      await expect(main(['auto'], { root, apiFactory: async () => api, buildExtension })).rejects.toThrow('已有提交');
      expect(buildExtension).not.toHaveBeenCalled();
      expect(api.upload).not.toHaveBeenCalled();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('auto skips after fetching data without packaging or changing the release journal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cws-growth-'));
    const { api } = setup();
    try {
      const directory = join(root, '.build/cws');
      await mkdir(directory, { recursive: true });
      await writeFile(join(root, 'package.json'), '{"version":"0.1.0"}');
      const previous = { name, version: '0.1.0.1', phase: 'submitted', counts: { formulaCount: 1000, caskCount: 1000 } };
      await writeFile(join(directory, 'state.json'), JSON.stringify(previous));
      await writeFile(join(directory, 'release-0.1.0.1.json'), JSON.stringify(previous));
      const buildExtension = async (_root, _directory, options) => options.checkMetadata({ formulaCount: 1004, caskCount: 1000 });
      const result = await main(['auto'], { root, apiFactory: async () => api, buildExtension });
      expect(result).toMatchObject({ skipped: true, increase: 4, candidate: { total: 2004 } });
      expect(api.upload).not.toHaveBeenCalled();
      expect(api.publish).not.toHaveBeenCalled();
      expect(JSON.parse(await readFile(join(directory, 'state.json')))).toEqual(previous);
      expect(JSON.parse((await readFile(join(directory, 'package-checks.jsonl'), 'utf8')).trim()).increase).toBe(4);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.each([
    ['0.1.0', ['0.1.0.9', '0.1.0.10'], undefined, 11],
    ['0.2.0', ['0.1.0.65535'], undefined, 1],
    ['0.1.0', ['0.1.0'], undefined, 1],
    ['0.1.0', ['0.1.0.1'], { version: '0.1.0.4' }, 5],
  ])('chooses next build for %s across channels and local history', (base, versions, previous, expected) => {
    const snapshot = { publishedItemRevisionStatus: { distributionChannels: versions.map(crxVersion => ({ crxVersion })) } };
    expect(nextBuildNumber(base, snapshot, previous)).toBe(expected);
  });
  it('rejects exhausted or outdated base versions', () => {
    expect(() => nextBuildNumber('0.1.0', status, { version: '0.1.0.65535' })).toThrow('用尽');
    expect(() => nextBuildNumber('0.0.9', status)).toThrow('落后');
  });
  it('auto blocks uncertain local writes before calling the store or building', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cws-auto-'));
    const apiFactory = vi.fn();
    const buildExtension = vi.fn();
    try {
      await mkdir(join(root, '.build/cws'), { recursive: true });
      await writeFile(join(root, '.build/cws/state.json'), '{"phase":"uncertain"}');
      await expect(main(['auto'], { root, apiFactory, buildExtension })).rejects.toThrow('禁止自动重试');
      expect(apiFactory).not.toHaveBeenCalled();
      expect(buildExtension).not.toHaveBeenCalled();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('status only calls the read endpoint', async () => {
    const { api } = setup();
    expect(await main(['status'], { apiFactory: async () => api })).toEqual(status);
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
  });
  it('dry-run never initializes credentials, including when overriding submit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cws-dry-'));
    const apiFactory = vi.fn();
    try {
      await mkdir(join(root, 'extension'));
      await writeFile(join(root, 'package.json'), '{"version":"0.1.0"}');
      await writeFile(join(root, 'extension/manifest.json'), '{"version":"0.1.0"}');
      await expect(main(['submit', '--dry-run'], { root, apiFactory })).rejects.toThrow('build number');
      expect(apiFactory).not.toHaveBeenCalled();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('locks concurrent invocations and releases after failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cws-lock-'));
    try {
      await withLock(root, async () => { await expect(withLock(root, async () => {})).rejects.toThrow('锁已存在'); });
      await expect(withLock(root, async () => { throw new Error('failed'); })).rejects.toThrow('failed');
      await withLock(root, async () => {});
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('packages a root manifest and exact data, detects tampering', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cws-package-'));
    try {
      const stage = join(root, 'extension');
      await mkdir(join(stage, 'data'), { recursive: true });
      const formulae = Array.from({ length: 1000 }, (_, i) => ({ name: `f${i}`, homepage: `https://github.com/org/repo${i}` }));
      const casks = Array.from({ length: 1000 }, (_, i) => ({ token: `c${i}`, homepage: `https://example${i}.com` }));
      const data = createBuildArtifacts(formulae, casks, { inputSources: { formulae: JSON.stringify(formulae), casks: JSON.stringify(casks) } });
      for (const [file, value] of [['domain-map', data.domainMapJson], ['github-map', data.githubMapJson], ['metadata', data.metadataJson]]) await writeFile(join(stage, `data/${file}.json`), value);
      await writeFile(join(stage, 'manifest.json'), JSON.stringify({ version: artifact.version }));
      const zip = join(root, `brew-finder-${artifact.version}.zip`);
      const result = await packageExtension(stage, zip, artifact.version);
      expect(result.zipSha256).toMatch(/^[a-f0-9]{64}$/);
      const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
      expect(names.split('\n')).toContain('manifest.json');
      expect(names).not.toContain('credentials');
      expect(JSON.parse(await readFile(join(stage, 'manifest.json'))).version).toBe(artifact.version);
      const artifactPath = join(root, 'artifact.json');
      await writeFile(artifactPath, JSON.stringify(result));
      const { api } = setup();
      const journal = join(root, '.build/cws');
      await mkdir(journal, { recursive: true });
      const baselinePath = join(journal, 'release-0.1.0.1.json');
      const baseline = { name, version: '0.1.0.1', phase: 'submitted', counts: { formulaCount: 1000, caskCount: 1000 } };
      await writeFile(baselinePath, JSON.stringify(baseline));
      const skipped = await main(['submit', '--artifact', artifactPath], { root, apiFactory: async () => api });
      expect(skipped).toMatchObject({ skipped: true, increase: 0, published: { total: 2000 } });
      expect(api.upload).not.toHaveBeenCalled();
      expect(api.publish).not.toHaveBeenCalled();
      await expect(readFile(join(journal, 'state.json'))).rejects.toThrow();
      expect(JSON.parse(await readFile(join(journal, 'published.json'))).total).toBe(2000);
      baseline.counts.formulaCount = 995;
      await writeFile(baselinePath, JSON.stringify(baseline));
      await main(['submit', '--artifact', artifactPath], { root, apiFactory: async () => api });
      expect(api.publish).toHaveBeenCalledOnce();
      expect(JSON.parse(await readFile(join(root, '.build/cws/state.json'))).phase).toBe('submitted');
      await writeFile(join(root, 'package.json'), '{"version":"0.1.0"}');
      api.publishType = 'DEFAULT_PUBLISH';
      api.upload.mockResolvedValue({ name, uploadState: 'SUCCEEDED', crxVersion: '0.1.0.3' });
      const buildExtension = async (buildRoot, directory, options) => {
        expect(buildRoot).toBe(root);
        expect(options['build-number']).toBe('3');
        // The lock must span building as well as upload and submission.
        await expect(withLock(directory, async () => {})).rejects.toThrow('锁已存在');
        await writeFile(join(stage, 'manifest.json'), '{"version":"0.1.0.3"}');
        const next = await packageExtension(stage, join(root, 'brew-finder-0.1.0.3.zip'), '0.1.0.3');
        const nextArtifact = join(root, 'next-artifact.json');
        await writeFile(nextArtifact, JSON.stringify(next));
        return { artifact: nextArtifact };
      };
      const autoResult = await main(['auto'], { root, apiFactory: async () => api, buildExtension });
      expect(autoResult).toEqual({ version: '0.1.0.3', state: 'PENDING_REVIEW', publishType: 'DEFAULT_PUBLISH' });
      expect(api.publish).toHaveBeenLastCalledWith({ publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true });
      const apiFactory = vi.fn();
      await writeFile(zip, 'tampered');
      await expect(main(['upload', '--artifact', artifactPath], { root, apiFactory })).rejects.toThrow('ZIP 哈希');
      expect(apiFactory).not.toHaveBeenCalled();
      await writeFile(join(stage, 'data/domain-map.json'), '{}');
      await expect(packageExtension(stage, join(root, 'bad.zip'), artifact.version)).rejects.toThrow('数据哈希');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
