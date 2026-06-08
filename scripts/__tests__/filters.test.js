import { describe, it, expect } from 'vitest';
import { isValidDomain, shouldExcludeDomain, shouldExcludeUrl } from '../filters.js';

describe('shouldExcludeDomain', () => {
  it('excludes web.archive.org', () => {
    expect(shouldExcludeDomain('web.archive.org')).toBe(true);
  });

  it('excludes archive.org', () => {
    expect(shouldExcludeDomain('archive.org')).toBe(true);
  });

  it('excludes packages.debian.org', () => {
    expect(shouldExcludeDomain('packages.debian.org')).toBe(true);
  });

  it('keeps normal domains', () => {
    expect(shouldExcludeDomain('www.docker.com')).toBe(false);
    expect(shouldExcludeDomain('iterm2.com')).toBe(false);
    expect(shouldExcludeDomain('ffmpeg.org')).toBe(false);
  });
});

describe('shouldExcludeUrl', () => {
  it('excludes non-http URLs', () => {
    expect(shouldExcludeUrl('ftp://example.com')).toBe(true);
    expect(shouldExcludeUrl('chrome://settings')).toBe(true);
    expect(shouldExcludeUrl('about:blank')).toBe(true);
  });

  it('excludes empty/null URLs', () => {
    expect(shouldExcludeUrl('')).toBe(true);
    expect(shouldExcludeUrl(null)).toBe(true);
    expect(shouldExcludeUrl(undefined)).toBe(true);
  });

  it('keeps http URLs', () => {
    expect(shouldExcludeUrl('http://example.com')).toBe(false);
    expect(shouldExcludeUrl('https://www.docker.com')).toBe(false);
  });
});

describe('isValidDomain', () => {
  it('accepts valid domains', () => {
    expect(isValidDomain('www.docker.com')).toBe(true);
    expect(isValidDomain('github.com')).toBe(true);
    expect(isValidDomain('iterm2.com')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(isValidDomain('')).toBe(false);
    expect(isValidDomain(null)).toBe(false);
  });
});
