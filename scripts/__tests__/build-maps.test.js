import { describe, it, expect } from 'vitest';
import { extractDomain, extractGithubRepo, buildPackageEntry, buildMaps } from '../build-maps.js';

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
});
