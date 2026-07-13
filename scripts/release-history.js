import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_RELEASE_TAG = /^v\d+\.\d+\.\d+-data\.\d+$/;

function publishedDataReleases(releases) {
  if (!Array.isArray(releases)) throw new Error('release history must be a JSON array');
  return releases.filter(release => (
    release?.isDraft === false && DATA_RELEASE_TAG.test(release.tagName)
  ));
}

export function nextDataBuildNumber(releases, baseVersion) {
  const prefix = `v${baseVersion}-data.`;
  const buildNumbers = publishedDataReleases(releases)
    .filter(({ tagName }) => tagName.startsWith(prefix))
    .map(({ tagName }) => Number(tagName.slice(prefix.length)));
  return Math.max(0, ...buildNumbers) + 1;
}

export function latestDataReleaseTag(releases) {
  const published = publishedDataReleases(releases)
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  return published.at(-1)?.tagName ?? null;
}

export async function main(argv = process.argv.slice(2)) {
  const [command, historyPath, baseVersion] = argv;
  if (!command || !historyPath) {
    throw new Error('usage: release-history.js <next-build|latest-tag> <releases.json> [base-version]');
  }
  const releases = JSON.parse(await readFile(resolve(historyPath), 'utf8'));

  if (command === 'next-build') {
    if (!baseVersion) throw new Error('next-build requires a base version');
    process.stdout.write(String(nextDataBuildNumber(releases, baseVersion)));
    return;
  }
  if (command === 'latest-tag') {
    process.stdout.write(latestDataReleaseTag(releases) ?? '');
    return;
  }
  throw new Error(`unknown release history command: ${command}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    console.error(`Release history lookup failed: ${error.message}`);
    process.exit(1);
  });
}
