import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import process from 'node:process';

const host = '127.0.0.1';
const port = Number(process.env.STUDYSTREAM_PORT || 47831);
const rootDir = resolve(import.meta.dirname, '..');
const distDir = join(rootDir, 'dist');
const dataDir = resolve(process.env.STUDYSTREAM_DATA_DIR || join(rootDir, 'data'));
const statePath = join(dataDir, 'state.json');
const tempPath = join(dataDir, 'state.tmp');
const clients = new Set();

const initialState = {
  version: 1,
  session: {
    phase: 'idle',
    tracking: false,
    phaseStartedAt: null,
    phaseEndsAt: null,
    pausedRemainingSeconds: null,
    lastCheckpointAt: Date.now(),
    sessionSeconds: 0,
    todaySeconds: 0,
    totalSeconds: 0,
    dayKey: new Date().toLocaleDateString('en-CA'),
  },
  settings: {
    studyMinutes: 30,
    breakMinutes: 10,
    language: 'ja',
    layout: 'horizontal',
    background: '#000000',
    backgroundOpacity: 0.9,
    textColor: '#ffffff',
    messages: {
      study: '集中しています。コメントは休憩中に読みます。',
      paused: '少し会話しています。学習タイマーは一時停止中です。',
      break: '休憩中です。コメントを読んでいます。',
      idle: 'まもなく学習を始めます。',
    },
    widgets: [
      { id: 'state', visible: true, size: 'large' },
      { id: 'timer', visible: true, size: 'large' },
      { id: 'message', visible: true, size: 'medium' },
      { id: 'session', visible: true, size: 'small' },
      { id: 'today', visible: true, size: 'small' },
      { id: 'streaks', visible: true, size: 'small' },
    ],
    streaks: [
      { id: 'smoke-free', name: '禁煙', startedOn: '2026-07-13', visible: true },
    ],
  },
};

await mkdir(dataDir, { recursive: true });

async function loadState() {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    await saveState(initialState);
    return initialState;
  }
}

async function saveState(value) {
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, statePath);
}

let currentState = await loadState();

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function broadcast(value) {
  const payload = `data: ${JSON.stringify(value)}\n\n`;
  for (const client of clients) client.write(payload);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('payload-too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function serveStatic(pathname, response) {
  if (!existsSync(distDir)) return false;
  const requested = pathname === '/' || pathname === '/overlay' ? 'index.html' : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(distDir, safePath);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(distDir, 'index.html');
  }
  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(response);
  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`);

  if (url.pathname === '/api/state' && request.method === 'GET') {
    sendJson(response, 200, currentState);
    return;
  }

  if (url.pathname === '/api/state' && request.method === 'PUT') {
    try {
      currentState = await readBody(request);
      await saveState(currentState);
      broadcast(currentState);
      sendJson(response, 200, currentState);
    } catch (error) {
      sendJson(response, error?.message === 'payload-too-large' ? 413 : 400, { error: 'invalid-state' });
    }
    return;
  }

  if (url.pathname === '/api/events' && request.method === 'GET') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    response.write(`data: ${JSON.stringify(currentState)}\n\n`);
    clients.add(response);
    request.on('close', () => clients.delete(response));
    return;
  }

  if (!(await serveStatic(url.pathname, response))) {
    sendJson(response, 503, { error: 'build-not-found', hint: 'Run npm run build first.' });
  }
});

server.listen(port, host, () => {
  console.log(`StudyStream local server: http://${host}:${port}`);
});
