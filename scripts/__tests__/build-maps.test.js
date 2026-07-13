import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractDomain,
  extractGithubRepo,
  buildPackageEntry,
  buildMaps,
  createBuildArtifacts,
  fetchJson,
  main,
  validateBuildCounts,
} from '../build-maps.js';

describe('extractDomain', () => {
  it('extracts hostname from URL', () => {
    expect(extractDomain('https://www.docker.com/products/')).toBe('www.docker.com');
    expect(extractDomain('https://iterm2.com')).toBe('iterm2.com');
    expect(extractDomain('https://ffmpeg.org/')).toBe('ffmpeg.org');
  });

  it('returns null for invalid URLs', () => {
    expect(extractDomain('not-a-url')).toBeNull();
    expect(extractDomain('')).toBeNull();
    expect(extractDomain(null)).toBeNull();
  });
});

describe('extractGithubRepo', () => {
  it('extracts user/repo from github URL', () => {
    expect(extractGithubRepo('https://github.com/docker/cli')).toBe('docker/cli');
    expect(extractGithubRepo('https://github.com/FFmpeg/FFmpeg')).toBe('FFmpeg/FFmpeg');
  });

  it('handles URLs with extra path segments', () => {
    expect(extractGithubRepo('https://github.com/docker/cli/issues')).toBe('docker/cli');
    expect(extractGithubRepo('https://github.com/FFmpeg/FFmpeg/tree/master')).toBe('FFmpeg/FFmpeg');
  });

  it('returns null for special github paths', () => {
    expect(extractGithubRepo('https://github.com/topics/docker')).toBeNull();
    expect(extractGithubRepo('https://github.com/trending')).toBeNull();
    expect(extractGithubRepo('https://github.com/settings')).toBeNull();
    expect(extractGithubRepo('https://github.com/notifications')).toBeNull();
  });

  it('returns null for github URLs without repo', () => {
    expect(extractGithubRepo('https://github.com')).toBeNull();
    expect(extractGithubRepo('https://github.com/docker')).toBeNull();
  });

  it('returns null for non-github URLs', () => {
    expect(extractGithubRepo('https://www.docker.com')).toBeNull();
  });
});

describe('buildPackageEntry', () => {
  it('builds entry from formula data', () => {
    const formula = {
      name: 'docker',
      desc: 'Pack, ship and run any application as a lightweight container',
      homepage: 'https://www.docker.com/',
      tap: 'homebrew/core',
    };
    expect(buildPackageEntry(formula, 'formula')).toEqual({
      name: 'docker',
      type: 'formula',
      desc: 'Pack, ship and run any application as a lightweight container',
      homepage: 'https://www.docker.com/',
      tap: 'homebrew/core',
    });
  });

  it('builds entry from cask data', () => {
    const cask = {
      token: 'iterm2',
      name: ['iTerm2'],
      desc: 'Terminal emulator',
      homepage: 'https://iterm2.com/',
      tap: 'homebrew/cask',
    };
    expect(buildPackageEntry(cask, 'cask')).toEqual({
      name: 'iterm2',
      type: 'cask',
      desc: 'Terminal emulator',
      homepage: 'https://iterm2.com/',
      tap: 'homebrew/cask',
    });
  });
});

describe('buildMaps', () => {
  it('processes formulae and casks into domain maps', async () => {
    const formulae = [
      { name: 'docker', desc: 'Container runtime', homepage: 'https://www.docker.com/', tap: 'homebrew/core' },
      { name: 'ffmpeg', desc: 'Media framework', homepage: 'https://ffmpeg.org/', tap: 'homebrew/core' },
    ];
    const casks = [
      { token: 'iterm2', name: ['iTerm2'], desc: 'Terminal', homepage: 'https://iterm2.com/', tap: 'homebrew/cask' },
    ];

    const result = await buildMaps(formulae, casks);

    expect(result.domainMap['www.docker.com']).toEqual([
      { name: 'docker', type: 'formula', desc: 'Container runtime', homepage: 'https://www.docker.com/', tap: 'homebrew/core' },
    ]);
    expect(result.domainMap['ffmpeg.org']).toEqual([
      { name: 'ffmpeg', type: 'formula', desc: 'Media framework', homepage: 'https://ffmpeg.org/', tap: 'homebrew/core' },
    ]);
    expect(result.domainMap['iterm2.com']).toEqual([
      { name: 'iterm2', type: 'cask', desc: 'Terminal', homepage: 'https://iterm2.com/', tap: 'homebrew/cask' },
    ]);
    expect(result.githubMap).toEqual({});
    expect(result.metadata.formulaCount).toBe(2);
    expect(result.metadata.caskCount).toBe(1);
    expect(result.metadata.domainCount).toBe(3);
  });

  it('routes github.com URLs to githubMap', async () => {
    const formulae = [
      { name: 'docker', desc: 'Container runtime', homepage: 'https://github.com/docker/cli' },
    ];
    const casks = [];

    const result = await buildMaps(formulae, casks);

    expect(result.githubMap['docker/cli']).toEqual([
      { name: 'docker', type: 'formula', desc: 'Container runtime', homepage: 'https://github.com/docker/cli', tap: '' },
    ]);
    expect(result.domainMap['github.com']).toBeUndefined();
  });

  it('excludes filtered domains', async () => {
    const formulae = [
      { name: 'archived', desc: 'Old', homepage: 'https://web.archive.org/web/123' },
      { name: 'debian', desc: 'Pkg', homepage: 'https://packages.debian.org/bullseye/htop' },
    ];
    const casks = [];

    const result = await buildMaps(formulae, casks);

    expect(result.domainMap['web.archive.org']).toBeUndefined();
    expect(result.domainMap['packages.debian.org']).toBeUndefined();
    expect(result.metadata.domainCount).toBe(0);
  });

  it('groups multiple packages under the same domain', async () => {
    const formulae = [
      { name: 'pkg1', desc: 'First', homepage: 'https://example.com/' },
      { name: 'pkg2', desc: 'Second', homepage: 'https://example.com/' },
    ];
    const casks = [];

    const result = await buildMaps(formulae, casks);

    expect(result.domainMap['example.com']).toHaveLength(2);
    expect(result.domainMap['example.com'][0].name).toBe('pkg1');
    expect(result.domainMap['example.com'][1].name).toBe('pkg2');
  });

  it('sorts map keys and package entries independently of upstream order', () => {
    const formulae = [
      { name: 'zeta', homepage: 'https://z.example/' },
      { name: 'beta', homepage: 'https://a.example/' },
      { name: 'alpha', homepage: 'https://a.example/' },
    ];

    const first = buildMaps(formulae, [], { buildTime: '2026-07-13T00:00:00.000Z' });
    const second = buildMaps([...formulae].reverse(), [], { buildTime: '2026-07-13T00:00:00.000Z' });

    expect(Object.keys(first.domainMap)).toEqual(['a.example', 'z.example']);
    expect(first.domainMap['a.example'].map(({ name }) => name)).toEqual(['alpha', 'beta']);
    expect(first).toEqual(second);
  });
});

describe('createBuildArtifacts', () => {
  it('records input and functional output SHA-256 checksums', () => {
    const formulaSource = '[{"name":"demo","homepage":"https://example.com"}]';
    const caskSource = '[]';
    const formulae = JSON.parse(formulaSource);
    const casks = JSON.parse(caskSource);

    const artifacts = createBuildArtifacts(formulae, casks, {
      buildTime: '2026-07-13T00:00:00.000Z',
      inputSources: { formulae: formulaSource, casks: caskSource },
    });

    expect(artifacts.metadata.inputChecksums).toEqual({
      formulaeSha256: 'f63ee0505bf11bc3cd8ac31813934bcac592bea0efc859ba2b2c05adf4066e4c',
      casksSha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    });
    expect(artifacts.metadata.outputChecksums.domainMapSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifacts.metadata.outputChecksums.githubMapSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(artifacts.metadataJson)).toEqual(artifacts.metadata);
  });
});

describe('validateBuildCounts', () => {
  const counts = {
    formulaCount: 8000,
    caskCount: 7000,
    domainCount: 7000,
    githubRepoCount: 3500,
  };

  it('rejects counts below absolute safety minimums', () => {
    expect(() => validateBuildCounts(
      { ...counts, formulaCount: 900 },
      { minimums: { formulaCount: 1000 } },
    )).toThrow('formulaCount 900 is below minimum 1000');
  });

  it('rejects a large count drop from the previous successful build', () => {
    expect(() => validateBuildCounts(counts, {
      baseline: { ...counts, domainCount: 10000 },
      maxChangePercent: 20,
    })).toThrow('domainCount dropped 30.00%');
  });

  it('rejects a large count increase from the previous successful build', () => {
    expect(() => validateBuildCounts(counts, {
      baseline: { ...counts, domainCount: 5000 },
      maxChangePercent: 20,
    })).toThrow('domainCount increased 40.00%');
  });
});

describe('fetchJson', () => {
  it('retries transient failures and validates the top-level array', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response('[{"name":"demo"}]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const result = await fetchJson('https://example.test/formula.json', {
      fetchImpl,
      retries: 2,
      retryDelayMs: 0,
      timeoutMs: 100,
    });

    expect(result.data).toEqual([{ name: 'demo' }]);
    expect(result.source).toBe('[{"name":"demo"}]');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('build-maps CLI', () => {
  it('builds from archived local input without using the network', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brew-finder-maps-'));
    const formulaFile = join(root, 'formula.json');
    const caskFile = join(root, 'cask.json');
    const outputDir = join(root, 'output');
    await writeFile(formulaFile, '[{"name":"demo","homepage":"https://example.com"}]');
    await writeFile(caskFile, '[]');

    try {
      await main([
        '--formula-file', formulaFile,
        '--cask-file', caskFile,
        '--output-dir', outputDir,
        '--build-time', '2026-07-13T00:00:00.000Z',
        '--min-formula', '0',
        '--min-cask', '0',
        '--min-domain', '0',
        '--min-github', '0',
      ]);

      const domainMap = JSON.parse(await readFile(join(outputDir, 'domain-map.json'), 'utf8'));
      expect(domainMap['example.com'][0].name).toBe('demo');
      expect(JSON.parse(await readFile(join(outputDir, 'metadata.json'), 'utf8')).buildTime)
        .toBe('2026-07-13T00:00:00.000Z');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
