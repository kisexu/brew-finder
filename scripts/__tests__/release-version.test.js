import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { main, prepareReleaseManifest } from '../release-version.js';

describe('prepareReleaseManifest', () => {
  it('uses A.B.C.N for Chrome and a readable date for version_name', () => {
    expect(prepareReleaseManifest(
      { manifest_version: 3, version: '0.1.0' },
      '0.1.0',
      17,
      '2026-07-13',
    )).toEqual({
      manifest_version: 3,
      version: '0.1.0.17',
      version_name: '0.1.0 · data 2026-07-13',
    });
  });

  it('rejects drift between package.json and the source manifest', () => {
    expect(() => prepareReleaseManifest(
      { version: '0.2.0' },
      '0.1.0',
      1,
      '2026-07-13',
    )).toThrow('manifest version 0.2.0 does not match package version 0.1.0');
  });

  it('rejects invalid Chrome version components', () => {
    expect(() => prepareReleaseManifest(
      { version: '0.1.0' },
      '0.1.0',
      65536,
      '2026-07-13',
    )).toThrow('build number must be an integer from 1 to 65535');
  });

  it('can calculate a workflow version without modifying the manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'brew-finder-version-'));
    const manifestPath = join(root, 'manifest.json');
    const packagePath = join(root, 'package.json');
    const sourceManifest = '{"manifest_version":3,"version":"0.1.0"}\n';
    await writeFile(manifestPath, sourceManifest);
    await writeFile(packagePath, '{"version":"0.1.0"}\n');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      await main([
        '--build-number', '17',
        '--date', '2026-07-13',
        '--manifest', manifestPath,
        '--package', packagePath,
        '--dry-run',
      ]);
      expect(stdout).toHaveBeenCalledWith('0.1.0.17');
      expect(await readFile(manifestPath, 'utf8')).toBe(sourceManifest);
    } finally {
      stdout.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
