import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, copyFile, lstat, open, rm, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateBuildCounts } from './build-maps.js';
import { prepareReleaseManifest } from './release-version.js';
import { createApi, releaseToStore, guardStatus, compareVersions } from './cws-api.js';

import { packageCounts, publishedCounts, recordGrowthCheck, writeRecord } from './cws-counts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = data => createHash('sha256').update(data).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' });
const capture = (command, args, cwd) => execFileSync(command, args, { cwd, maxBuffer: 64 * 1024 * 1024 });

export async function withLock(directory, operation) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'lock');
  let lock;
  try { lock = await open(path, 'wx', 0o600); } catch { throw new Error('本地发布锁已存在；确认没有运行进程后人工移除 lock'); }
  try { await lock.writeFile(String(process.pid)); return await operation(); }
  finally { await lock.close(); await rm(path); }
}

export async function packageExtension(stage, destination, version) {
  const metadata = await json(join(stage, 'data/metadata.json'));
  for (const field of ['formulaCount', 'caskCount', 'domainCount', 'githubRepoCount']) {
    if (!Number.isInteger(metadata[field])) throw new Error('数据计数缺失');
  }
  validateBuildCounts(metadata);
  for (const [name, field] of [['domain-map', 'domainMapSha256'], ['github-map', 'githubMapSha256']]) {
    const bytes = await readFile(join(stage, `data/${name}.json`));
    if (hash(bytes) !== metadata.outputChecksums?.[field]) throw new Error('数据哈希不一致');
  }
  const manifest = await readFile(join(stage, 'manifest.json'));
  if (JSON.parse(manifest).version !== version) throw new Error('manifest 版本不一致');
  run('zip', ['-q', '-r', destination, '.'], stage);
  if (!capture('unzip', ['-p', destination, 'manifest.json'], stage).equals(manifest)) throw new Error('ZIP manifest 不一致');
  for (const name of ['domain-map', 'github-map', 'metadata']) {
    if (!capture('unzip', ['-p', destination, `data/${name}.json`], stage).equals(await readFile(join(stage, `data/${name}.json`)))) throw new Error('ZIP 数据不一致');
  }
  const zip = await readFile(destination);
  return { version, zipSha256: hash(zip), manifestSha256: hash(manifest), metadata };
}

export async function build(root, directory, options) {
  const pkg = await json(join(root, 'package.json'));
  const sourceManifest = await json(join(root, 'extension/manifest.json'));
  const date = options.date || new Date().toISOString().slice(0, 10);
  const version = prepareReleaseManifest(sourceManifest, pkg.version, Number(options['build-number']), date).version;
  run('npm', ['test'], root);
  const workspace = await mkdtemp(join(directory, 'build-'));
  await mkdir(join(workspace, 'scripts'));
  await copyFile(join(root, 'package.json'), join(workspace, 'package.json'));
  for (const name of ['build-maps.js', 'filters.js', 'release-version.js']) await copyFile(join(root, 'scripts', name), join(workspace, 'scripts', name));
  const files = capture('git', ['ls-files', '-z', '--', 'extension'], root).toString().split('\0').filter(Boolean);
  for (const file of files) {
    if (file.startsWith('extension/data/')) continue;
    if (!(await lstat(join(root, file))).isFile()) throw new Error('扩展文件必须为普通文件');
    const bytes = await readFile(join(root, file));
    if (/PRIVATE KEY|"private_key"|"refresh_token"/.test(bytes.toString())) throw new Error('扩展包含疑似凭据，停止打包');
    await mkdir(dirname(join(workspace, file)), { recursive: true });
    await writeFile(join(workspace, file), bytes);
  }
  const args = ['run', 'build:maps', '--', '--output-dir', join(workspace, 'data'), '--input-dir', join(workspace, 'inputs')];
  for (const name of ['formula-file', 'cask-file', 'baseline-metadata']) if (options[name]) args.push(`--${name}`, resolve(root, options[name]));
  run('npm', args, workspace);
  const decision = await options.checkMetadata?.(await json(join(workspace, 'data/metadata.json')));
  if (decision?.skipped) return decision;
  run('npm', ['run', 'build:extension'], workspace);
  run('npm', ['run', 'release:version', '--', '--build-number', options['build-number'], '--date', date], workspace);
  const path = join(workspace, `brew-finder-${version}.zip`);
  const artifact = await packageExtension(join(workspace, 'extension'), path, version);
  artifact.sourceSha = capture('git', ['rev-parse', 'HEAD'], root).toString().trim();
  artifact.sourceDirty = Boolean(capture('git', ['--no-optional-locks', 'status', '--porcelain'], root).length);
  await writeFile(join(workspace, 'artifact.json'), JSON.stringify(artifact, null, 2));
  await writeFile(`${path}.sha256`, `${artifact.zipSha256}  brew-finder-${version}.zip\n`);
  return { path, artifact: join(workspace, 'artifact.json'), version };
}

export function nextBuildNumber(baseVersion, status, previous) {
  // Validate the source base version with the same rules used by packaging.
  prepareReleaseManifest({ version: baseVersion }, baseVersion, 1, '2000-01-01');
  const versions = [status.publishedItemRevisionStatus, status.submittedItemRevisionStatus]
    .filter(Boolean).flatMap(revision => revision.distributionChannels.map(channel => channel.crxVersion));
  if (previous) versions.push(previous.version);
  let number = 1;
  for (const version of versions) {
    compareVersions(version, version);
    const parts = version.split('.').map(Number);
    const base = parts.concat([0, 0]).slice(0, 3).join('.');
    const comparison = compareVersions(baseVersion, base);
    if (comparison < 0) throw new Error('package.json 基础版本落后于商店或本地发布记录，请先更新源码版本');
    if (comparison === 0) number = Math.max(number, (parts[3] || 0) + 1);
  }
  if (number > 65535) throw new Error('构建编号已用尽，请提升 package.json 和 manifest 基础版本');
  return number;
}

export async function main(argv = process.argv.slice(2), { root = ROOT, apiFactory = createApi, buildExtension = build } = {}) {
  const { values: options, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    'build-number': { type: 'string' }, date: { type: 'string' },
    'formula-file': { type: 'string' }, 'cask-file': { type: 'string' }, 'baseline-metadata': { type: 'string' },
    artifact: { type: 'string' }, 'dry-run': { type: 'boolean', default: false },
  } });
  const mode = options['dry-run'] ? 'dry-run' : positionals[0];
  if (positionals.length > 1 || !['build', 'dry-run', 'status', 'upload', 'submit', 'auto'].includes(mode)) throw new Error('用法：cws-release.js build|dry-run|status|upload|submit|auto');
  if (mode === 'status') return (await apiFactory(root)).status();
  const directory = join(root, '.build/cws');
  return withLock(directory, async () => {
    if (['build', 'dry-run'].includes(mode)) return build(root, directory, options);
    const statePath = join(directory, 'state.json');
    let previous;
    try { previous = await json(statePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    let api;
    if (mode === 'auto') {
      if (options.artifact || options['build-number'] || options['formula-file'] || options['cask-file']) throw new Error('auto 自动选择版本和产物，并从 Homebrew 获取最新数据');
      if (previous && !['uploaded', 'submitted'].includes(previous.phase)) throw new Error('上次写请求结果不确定；先运行 status 并人工核对，禁止自动重试');
      api = await apiFactory(root);
      const status = await api.status();
      if (status.name !== api.name || (previous && previous.name !== api.name)) throw new Error('商店目标不匹配');
      guardStatus(status);
      const published = await publishedCounts(directory, status, previous);
      const pkg = await json(join(root, 'package.json'));
      const buildNumber = nextBuildNumber(pkg.version, status, previous);
      const result = await buildExtension(root, directory, { ...options,
        'build-number': String(buildNumber),
        checkMetadata: metadata => recordGrowthCheck(directory, api.name, `${pkg.version}.${buildNumber}`, published, metadata),
      });
      if (result.skipped) return result;
      options.artifact = result.artifact;
    }
    if (!options.artifact) throw new Error('上传/送审需要 --artifact <artifact.json>');
    const artifactPath = resolve(options.artifact);
    const artifact = await json(artifactPath);
    // Validate version before using it in a file name.
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(artifact.version)) throw new Error('产物版本格式错误');
    const zipPath = join(dirname(artifactPath), `brew-finder-${artifact.version}.zip`);
    const zip = await readFile(zipPath);
    if (hash(zip) !== artifact.zipSha256) throw new Error('ZIP 哈希不一致');
    const manifest = capture('unzip', ['-p', zipPath, 'manifest.json'], root);
    if (hash(manifest) !== artifact.manifestSha256 || JSON.parse(manifest).version !== artifact.version) throw new Error('ZIP 版本/manifest 哈希不一致');
    const metadata = JSON.parse(capture('unzip', ['-p', zipPath, 'data/metadata.json'], root));
    validateBuildCounts(metadata);
    if (JSON.stringify(metadata) !== JSON.stringify(artifact.metadata)) throw new Error('ZIP metadata 不一致');
    for (const [file, field] of [['domain-map', 'domainMapSha256'], ['github-map', 'githubMapSha256']]) {
      if (hash(capture('unzip', ['-p', zipPath, `data/${file}.json`], root)) !== metadata.outputChecksums?.[field]) throw new Error('ZIP 数据哈希不一致');
    }
    api ??= await apiFactory(root);
    const save = async state => {
      state = { ...state, counts: packageCounts(metadata) };
      if (['uploaded', 'submitted'].includes(state.phase)) await writeRecord(join(directory, `release-${state.version}.json`), state);
      await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
      await rename(`${statePath}.tmp`, statePath);
    };
    return releaseToStore({ api, artifact, zip, submit: mode === 'submit' || mode === 'auto', previous, save,
      beforeUpload: async status => recordGrowthCheck(directory, api.name, artifact.version,
        await publishedCounts(directory, status, previous), metadata),
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
