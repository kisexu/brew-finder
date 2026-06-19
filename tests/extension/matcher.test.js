import { describe, it, expect } from 'vitest';
import { matchUrl, matchUrlForOverlay, matchUrlForPopup } from '../../extension/utils/matcher.js';

const domainMap = {
  'www.docker.com': [
    { name: 'docker', type: 'formula', desc: 'Container runtime', homepage: 'https://www.docker.com/' },
  ],
  'iterm2.com': [{ name: 'iterm2', type: 'cask', desc: 'Terminal' }],
  'example.com': [
    { name: 'pkg1', type: 'formula', desc: 'First' },
    { name: 'pkg2', type: 'cask', desc: 'Second' },
  ],
  'www.cursor.com': [
    { name: 'cursor', type: 'cask', desc: 'Editor', homepage: 'https://www.cursor.com/' },
  ],
  'cursor.com': [
    { name: 'cursor-cli', type: 'cask', desc: 'CLI', homepage: 'https://cursor.com/' },
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
  'docs.example.co.uk': [
    { name: 'uk-docs', type: 'formula', desc: 'Docs', homepage: 'https://docs.example.co.uk/' },
  ],
  'example.co.uk': [
    { name: 'uk-cli', type: 'formula', desc: 'CLI', homepage: 'https://example.co.uk/' },
  ],
  'foo.github.io': [
    { name: 'foo-tool', type: 'formula', desc: 'Foo', homepage: 'https://foo.github.io/' },
  ],
  'bar.github.io': [
    { name: 'bar-tool', type: 'formula', desc: 'Bar', homepage: 'https://bar.github.io/' },
  ],
  'www.bigsite.com': [
    { name: 'big-app', type: 'cask', desc: 'App', homepage: 'https://www.bigsite.com/' },
    { name: 'big-cli', type: 'formula', desc: 'CLI', homepage: 'https://www.bigsite.com/cli/' },
  ],
  ...Object.fromEntries(
    Array.from({ length: 21 }, (_, index) => [
      `tool-${index}.bigsite.com`,
      [{
        name: `big-tool-${index}`,
        type: 'formula',
        desc: `Tool ${index}`,
        homepage: `https://tool-${index}.bigsite.com/`,
      }],
    ])
  ),
  'fonts.example.com': Array.from({ length: 21 }, (_, index) => ({
    name: `font-${index}`,
    type: 'cask',
    desc: `Font ${index}`,
    homepage: `https://fonts.example.com/specimen/font-${index}/`,
  })),
};

const githubMap = {
  'docker/cli': [{ name: 'docker', type: 'formula', desc: 'Container runtime' }],
  'FFmpeg/FFmpeg': [{ name: 'ffmpeg', type: 'formula', desc: 'Media framework' }],
};

describe('matchUrl', () => {
  it('matches non-github domains', () => {
    const result = matchUrl('https://www.docker.com/products/', domainMap, githubMap);
    expect(result.matches).toEqual([
      { name: 'docker', type: 'formula', desc: 'Container runtime', homepage: 'https://www.docker.com/' },
    ]);
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

describe('matchUrlForPopup', () => {
  it('matches all homepage packages under the same root domain', () => {
    const result = matchUrlForPopup('https://cursor.com/docs', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['cursor', 'cursor-cli']);
  });

  it('matches root-domain packages from a subdomain page', () => {
    const result = matchUrlForPopup('https://docs.cursor.com/reference', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['cursor', 'cursor-cli']);
  });

  it('keeps github matching on the original repository rule', () => {
    const result = matchUrlForPopup('https://github.com/docker/cli/issues', domainMap, githubMap);

    expect(result.matches).toEqual([{ name: 'docker', type: 'formula', desc: 'Container runtime' }]);
  });

  it('groups common multi-part public suffix root domains', () => {
    const result = matchUrlForPopup('https://www.example.co.uk/', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['uk-docs', 'uk-cli']);
  });

  it('does not merge separate hosted private suffix sites', () => {
    const result = matchUrlForPopup('https://foo.github.io/docs', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['foo-tool']);
  });

  it('falls back to the current hostname when root-domain fanout is too large', () => {
    const result = matchUrlForPopup('https://www.bigsite.com/', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['big-app', 'big-cli']);
  });

  it('uses homepage path matching when the current hostname has too many matches', () => {
    const result = matchUrlForPopup('https://fonts.example.com/specimen/font-3/', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['font-3']);
  });
});

describe('matchUrlForOverlay', () => {
  it('uses broad root-domain discovery while there are three or fewer matches', () => {
    const result = matchUrlForOverlay('https://docs.cursor.com/reference', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['cursor', 'cursor-cli']);
  });

  it('uses broad root-domain discovery even when the current hostname has a narrower match', () => {
    const result = matchUrlForOverlay('https://www.cursor.com/', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['cursor', 'cursor-cli']);
  });

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

  it('falls back to concise current-hostname matches for large root domains', () => {
    const result = matchUrlForOverlay('https://www.bigsite.com/', domainMap, githubMap);

    expect(result.matches.map((match) => match.name)).toEqual(['big-app', 'big-cli']);
  });
});
