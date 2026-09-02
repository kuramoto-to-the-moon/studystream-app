import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputPath = join(root, 'THIRD_PARTY_LICENSES', 'DEPENDENCIES.txt');
const candidatePattern = /^(licen[cs]e|copying|notice|unlicense)(\..*|-.*)?$/i;
const packages = [];

function licenseFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => candidatePattern.test(name))
    .map((name) => join(directory, name))
    .filter((path) => statSync(path).isFile());
}

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
for (const [relativePath, metadata] of Object.entries(lock.packages ?? {})) {
  if (!relativePath.startsWith('node_modules/')) continue;
  const directory = join(root, relativePath);
  if (!existsSync(directory)) continue;
  const packageJsonPath = join(directory, 'package.json');
  const packageJson = existsSync(packageJsonPath)
    ? JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    : {};
  packages.push({
    ecosystem: 'npm',
    name: packageJson.name ?? relativePath.slice(relativePath.lastIndexOf('node_modules/') + 13),
    version: packageJson.version ?? metadata.version ?? 'unknown',
    license: packageJson.license ?? metadata.license ?? 'NOT DECLARED',
    source: typeof packageJson.repository === 'string'
      ? packageJson.repository
      : packageJson.repository?.url ?? packageJson.homepage ?? '',
    directory,
  });
}

const cargo = spawnSync(
  'cargo',
  ['metadata', '--manifest-path', join(root, 'src-tauri', 'Cargo.toml'), '--format-version', '1', '--locked'],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
if (cargo.status !== 0) {
  if (cargo.error) console.error(cargo.error.message);
  process.stderr.write(cargo.stderr);
  process.exit(cargo.status ?? 1);
}
for (const metadata of JSON.parse(cargo.stdout).packages) {
  packages.push({
    ecosystem: 'cargo',
    name: metadata.name,
    version: metadata.version,
    license: metadata.license ?? 'NOT DECLARED',
    source: metadata.repository ?? metadata.homepage ?? '',
    directory: dirname(metadata.manifest_path),
  });
}

packages.sort((left, right) =>
  left.ecosystem.localeCompare(right.ecosystem)
  || left.name.localeCompare(right.name)
  || left.version.localeCompare(right.version));

const documents = new Map();
const inventory = [];
for (const pkg of packages) {
  const hashes = [];
  for (const path of licenseFiles(pkg.directory)) {
    const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim();
    if (!text) continue;
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const document = documents.get(hash) ?? { text, packages: [] };
    document.packages.push(`${pkg.ecosystem}:${pkg.name}@${pkg.version}`);
    documents.set(hash, document);
    hashes.push(hash);
  }
  inventory.push({ ...pkg, hashes: [...new Set(hashes)] });
}

const generatedAt = new Date().toISOString().slice(0, 10);
const undeclared = inventory.filter((item) => item.license === 'NOT DECLARED');
if (undeclared.length) {
  console.error(`Missing license metadata: ${undeclared.map((item) => `${item.ecosystem}:${item.name}@${item.version}`).join(', ')}`);
  process.exit(1);
}
const lines = [
  'StudyDot third-party dependency license bundle',
  `Generated from package-lock.json and Cargo.lock on ${generatedAt}.`,
  '',
  'This file records packages present in the build environment. Platform-specific',
  'optional packages not installed on the build host are omitted and must be',
  'regenerated on each release platform.',
  '',
  'DEPENDENCY INVENTORY',
  '====================',
  '',
];
for (const item of inventory) {
  lines.push(`${item.ecosystem}:${item.name}@${item.version}`);
  lines.push(`SPDX: ${item.license}`);
  if (item.source) lines.push(`Source: ${item.source}`);
  lines.push(`License documents: ${item.hashes.length ? item.hashes.join(', ') : 'none found; see SPDX and source'}`);
  lines.push('');
}
lines.push('LICENSE AND NOTICE DOCUMENTS', '============================', '');
for (const [hash, document] of [...documents.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  lines.push(`Document ${hash}`);
  lines.push(`Applies to: ${document.packages.sort().join(', ')}`);
  lines.push('-'.repeat(80), document.text, '-'.repeat(80), '');
}

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${outputPath}`);
console.log(`${inventory.length} installed packages, ${documents.size} unique license/notice documents`);
