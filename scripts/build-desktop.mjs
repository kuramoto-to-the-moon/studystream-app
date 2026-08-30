import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const tauriArgs = ['tauri', 'build'];
if (process.platform === 'darwin') tauriArgs.push('--bundles', 'app');
run('npx', tauriArgs);

if (process.platform === 'darwin') {
  const appPath = resolve('src-tauri/target/release/bundle/macos/StudyStream.app');
  run('codesign', ['--force', '--deep', '--sign', '-', appPath]);
  console.log(`Local macOS app: ${appPath}`);
}
