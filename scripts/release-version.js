import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

function validateBaseVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`package version ${version} must use A.B.C numeric format`);
  }
  if (version.split('.').some(component => Number(component) > 65535)) {
    throw new Error(`package version ${version} contains a component above 65535`);
  }
}

export function prepareReleaseManifest(manifest, packageVersion, buildNumber, date) {
  validateBaseVersion(packageVersion);
  if (manifest.version !== packageVersion) {
    throw new Error(
      `manifest version ${manifest.version} does not match package version ${packageVersion}`,
    );
  }
  if (!Number.isInteger(buildNumber) || buildNumber < 1 || buildNumber > 65535) {
    throw new Error('build number must be an integer from 1 to 65535');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('date must use YYYY-MM-DD format');
  }

  return {
    ...manifest,
    version: `${packageVersion}.${buildNumber}`,
    version_name: `${packageVersion} · data ${date}`,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'build-number': { type: 'string' },
      date: { type: 'string' },
      manifest: { type: 'string', default: 'extension/manifest.json' },
      package: { type: 'string', default: 'package.json' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!values['build-number'] || !values.date) {
    throw new Error('--build-number and --date are required');
  }

  const manifestPath = resolve(values.manifest);
  const [manifest, packageJson] = await Promise.all([
    readFile(manifestPath, 'utf8').then(JSON.parse),
    readFile(resolve(values.package), 'utf8').then(JSON.parse),
  ]);
  const prepared = prepareReleaseManifest(
    manifest,
    packageJson.version,
    Number(values['build-number']),
    values.date,
  );
  if (!values['dry-run']) {
    await writeFile(manifestPath, `${JSON.stringify(prepared, null, 2)}\n`);
  }
  process.stdout.write(prepared.version);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    console.error(`Version preparation failed: ${error.message}`);
    process.exit(1);
  });
}
