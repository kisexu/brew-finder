import { describe, it, expect } from 'vitest';

await import('../../extension/utils/command.js');

const { installCommandFor, isHomebrewCask } = globalThis.BrewFinderCommand;

describe('BrewFinderCommand', () => {
  it('adds --cask for homebrew/cask packages', () => {
    const match = { name: 'google-drive', type: 'cask', tap: 'homebrew/cask' };

    expect(isHomebrewCask(match)).toBe(true);
    expect(installCommandFor(match)).toBe('brew install --cask google-drive');
  });

  it('adds --cask for legacy cask entries without tap metadata', () => {
    expect(installCommandFor({ name: 'iterm2', type: 'cask' })).toBe('brew install --cask iterm2');
  });

  it('keeps formula commands unchanged', () => {
    expect(installCommandFor({ name: 'ffmpeg', type: 'formula', tap: 'homebrew/core' })).toBe('brew install ffmpeg');
  });
});
