import { describe, it, expect } from 'vitest';
import { matchUrl, matchUrlForOverlay } from '../../extension/utils/matcher.js';

const domainMap = {
  'www.docker.com': [{ name: 'docker', type: 'formula', desc: 'Container runtime' }],
  'iterm2.com': [{ name: 'iterm2', type: 'cask', desc: 'Terminal' }],
  'example.com': [
    { name: 'pkg1', type: 'formula', desc: 'First' },
    { name: 'pkg2', type: 'cask', desc: 'Second' },
  ],
  'www.google.com': [
    { name: 'google-chrome', type: 'cask', desc: 'Web browser', homepage: 'https://www.google.com/chrome/' },
    { name: 'google-chrome@beta', type: 'cask', desc: 'Web browser', homepage: 'https://www.google.com/chrome/' },
    { name: 'google-drive', type: 'cask', desc: 'Storage', homepage: 'https://www.google.com/drive/' },
    { name: 'google-earth-pro', type: 'cask', desc: 'Virtual globe', homepage: 'https://www.google.com/earth/' },
  ],
  'downloads.example.com': [
    { name: 'pkg1', type: 'formula', desc: 'First', homepage: 'https://downloads.example.com/' },
    { name: 'pkg2', type: 'formula', desc: 'Second', homepage: 'https://downloads.example.com/' },
    { name: 'pkg3', type: 'formula', desc: 'Third', homepage: 'https://downloads.example.com/' },
    { name: 'pkg4', type: 'formula', desc: 'Fourth', homepage: 'https://downloads.example.com/' },
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

  it('keeps broad domain matching for large domains', () => {
    const result = matchUrl('https://www.google.com/', domainMap, githubMap);
    expect(result.matches).toHaveLength(4);
  });

  it('handles invalid URLs gracefully', () => {
    const result = matchUrl('not-a-url', domainMap, githubMap);
    expect(result.matches).toEqual([]);
  });
});

describe('matchUrlForOverlay', () => {
  it('narrows large domains to the matching homepage path', () => {
    const result = matchUrlForOverlay('https://www.google.com/chrome/browser-tools/', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['google-chrome', 'google-chrome@beta']);
  });

  it('shows only the package for another large-domain homepage path', () => {
    const result = matchUrlForOverlay('https://www.google.com/drive/download/', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['google-drive']);
  });

  it('returns no overlay matches for a large domain root when packages use specific paths', () => {
    const result = matchUrlForOverlay('https://www.google.com/', domainMap, githubMap);

    expect(result.matches).toEqual([]);
  });

  it('leaves large domains unchanged when homepages cannot distinguish packages', () => {
    const result = matchUrlForOverlay('https://downloads.example.com/', domainMap, githubMap);

    expect(result.matches).toHaveLength(4);
  });
});
