import { spawn } from 'node:child_process';
import process from 'node:process';

const children = [
  spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await Promise.race(
  children.map(
    (child) =>
      new Promise((resolve) => {
        child.on('exit', resolve);
      }),
  ),
);

stop();
