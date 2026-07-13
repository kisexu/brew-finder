import { describe, expect, it } from 'vitest';
import { latestDataReleaseTag, nextDataBuildNumber } from '../release-history.js';

describe('release history', () => {
  it('supports the first build when the repository has no releases', () => {
    expect(nextDataBuildNumber([], '0.1.0')).toBe(1);
    expect(latestDataReleaseTag([])).toBeNull();
  });

  it('increments the largest published build for the current code version', () => {
    const releases = [
      { tagName: 'v0.1.0-data.2', isDraft: false, createdAt: '2026-07-10T00:00:00Z' },
      { tagName: 'v0.1.0-data.9', isDraft: false, createdAt: '2026-07-01T00:00:00Z' },
      { tagName: 'v0.1.0-data.12', isDraft: true, createdAt: '2026-07-12T00:00:00Z' },
      { tagName: 'v0.2.0-data.4', isDraft: false, createdAt: '2026-07-11T00:00:00Z' },
    ];

    expect(nextDataBuildNumber(releases, '0.1.0')).toBe(10);
    expect(latestDataReleaseTag(releases)).toBe('v0.2.0-data.4');
  });
});
