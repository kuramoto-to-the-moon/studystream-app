import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const tauriArgs = ['tauri', 'build'];
if (process.platform === 'darwin') tauriArgs.push('--bundles', 'app,dmg');
run(process.execPath, ['scripts/generate-license-bundle.mjs']);
run('npx', tauriArgs);

if (process.platform === 'darwin') {
  const appPath = resolve('src-tauri/target/release/bundle/macos/StudyDot.app');
  const dmgPath = resolve('src-tauri/target/release/bundle/dmg');
  console.log(`Local macOS app: ${appPath}`);
  console.log(`Local macOS installer directory: ${dmgPath}`);
}
