import { describe, it, expect } from 'vitest';
import { matchUrl } from '../../extension/utils/matcher.js';

const domainMap = {
  'www.docker.com': [{ name: 'docker', type: 'formula', desc: 'Container runtime' }],
  'iterm2.com': [{ name: 'iterm2', type: 'cask', desc: 'Terminal' }],
  'example.com': [
    { name: 'pkg1', type: 'formula', desc: 'First' },
    { name: 'pkg2', type: 'cask', desc: 'Second' },
  ],
};

const githubMap = {
  'docker/cli': [{ name: 'docker', type: 'formula', desc: 'Container runtime' }],
  'FFmpeg/FFmpeg': [{ name: 'ffmpeg', type: 'formula', desc: 'Media framework' }],
};

describe('matchUrl', () => {
  it('matches non-github domains', () => {
    const result = matchUrl('https://www.docker.com/products/', domainMap, githubMap);
    expect(result.matches).toEqual([{ name: 'docker', type: 'formula', desc: 'Container runtime' }]);
  });

  it('matches github repos by user/repo path', () => {
    const result = matchUrl('https://github.com/docker/cli', domainMap, githubMap);
    expect(result.matches).toEqual([{ name: 'docker', type: 'formula', desc: 'Container runtime' }]);
  });

  it('matches github repos with extra path segments', () => {
    const result = matchUrl('https://github.com/FFmpeg/FFmpeg/tree/master', domainMap, githubMap);
    expect(result.matches).toEqual([{ name: 'ffmpeg', type: 'formula', desc: 'Media framework' }]);
  });

  it('returns empty matches for unknown domains', () => {
    const result = matchUrl('https://unknown-site.com/page', domainMap, githubMap);
    expect(result.matches).toEqual([]);
  });

  it('skips github special paths', () => {
    const result = matchUrl('https://github.com/topics/docker', domainMap, githubMap);
    expect(result.matches).toEqual([]);
  });

  it('skips github URLs without repo', () => {
    const result = matchUrl('https://github.com/docker', domainMap, githubMap);
    expect(result.matches).toEqual([]);
  });

  it('returns multiple matches for domains with multiple packages', () => {
    const result = matchUrl('https://example.com/', domainMap, githubMap);
    expect(result.matches).toHaveLength(2);
  });

  it('handles invalid URLs gracefully', () => {
    const result = matchUrl('not-a-url', domainMap, githubMap);
    expect(result.matches).toEqual([]);
  });
});
