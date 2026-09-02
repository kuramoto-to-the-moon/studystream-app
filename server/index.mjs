import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { isStaleState, mergeStateSections } from './stateRevision.mjs';

const host = '127.0.0.1';
const port = Number(process.env.STUDYSTREAM_PORT || 47831);
const allowedHosts = new Set([`${host}:${port}`, `localhost:${port}`]);
const rootDir = resolve(import.meta.dirname, '..');
const distDir = join(rootDir, 'dist');
const dataDir = resolve(process.env.STUDYSTREAM_DATA_DIR || join(rootDir, 'data'));
const statePath = join(dataDir, 'state.json');
const tempPath = join(dataDir, 'state.tmp');
const clients = new Set();

const initialState = {
  version: 1,
  updatedAt: 0,
  settingsUpdatedAt: 0,
  sessionUpdatedAt: 0,
  session: {
    phase: 'idle',
    tracking: false,
    intervalCompleted: false,
    phaseStartedAt: null,
    phaseEndsAt: null,
    pausedRemainingSeconds: null,
    pauseReason: null,
    lastCheckpointAt: Date.now(),
    sessionSeconds: 0,
    todaySeconds: 0,
    offstreamTodaySeconds: 0,
    totalSeconds: 0,
    dayKey: new Date().toLocaleDateString('en-CA'),
    dailySeconds: {},
  },
  settings: {
    studyMinutes: 30,
    breakMinutes: 10,
    studyDurationSeconds: 1800,
    breakDurationSeconds: 600,
    autoCycleEnabled: true,
    completionSoundEnabled: true,
    autoPauseVoiceEnabled: false,
    autoPauseVoiceSeconds: 2,
    speechLanguage: 'ja',
    language: 'ja',
    layout: 'horizontal',
    boardFont: 'sans',
    background: '#000000',
    backgroundOpacity: 0.78,
    textColor: '#ffffff',
    textOpacity: 1,
    secondaryTextColor: '#a3a3a3',
    secondaryTextOpacity: 1,
    secondaryTextDefaultVersion: 4,
    boardAppearanceDefaultVersion: 3,
    defaultStreakVersion: 2,
    showMetricSeconds: false,
    note: '',
    offstreamEnabled: false,
    metricKinds: {
      session: 'session', today: 'today', streaks: 'streaks',
      metric4: 'week', metric5: 'month', metric6: 'year', metric7: 'total',
    },
    messages: {
      study: '集中しています。コメントは休憩中に読みます。',
      paused: '少し会話しています。学習タイマーは一時停止中です。',
      break: '休憩中です。コメントを読んでいます。',
      idle: 'まもなく学習を始めます。',
    },
    widgets: [
      { id: 'state', visible: true },
      { id: 'timer', visible: true },
      { id: 'message', visible: true },
      { id: 'offstream', visible: true },
      { id: 'note', visible: true },
      { id: 'session', visible: true },
      { id: 'today', visible: true },
      { id: 'streaks', visible: true },
      { id: 'metric4', visible: false },
      { id: 'metric5', visible: false },
      { id: 'metric6', visible: false },
      { id: 'metric7', visible: false },
    ],
    streaks: [
      { id: 'workout', name: '筋トレ', kind: 'count', count: 0, unit: '回', visible: true },
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
  await writeFile(tempPath, JSON.stringify(value), 'utf8');
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

function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function isAllowedWriteRequest(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:'
      && (parsed.hostname === host || parsed.hostname === 'localhost');
  } catch {
    return false;
  }
}

function broadcast(value) {
  const payload = `data: ${JSON.stringify(value)}\n\n`;
  for (const client of clients) client.write(payload);
}

function copyObsUrl() {
  const command = process.platform === 'win32' ? 'cmd' : 'pbcopy';
  const args = process.platform === 'win32' ? ['/C', 'clip'] : [];
  return new Promise((resolveCopy, rejectCopy) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    child.once('error', rejectCopy);
    child.once('close', (code) => code === 0 ? resolveCopy() : rejectCopy(new Error('clipboard-command-failed')));
    child.stdin.end(`http://${host}:${port}/overlay`);
  });
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
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
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
  applySecurityHeaders(response);
  if (!allowedHosts.has(request.headers.host || '')) {
    sendJson(response, 403, { error: 'invalid-host' });
    return;
  }
  if (!isAllowedWriteRequest(request)) {
    sendJson(response, 403, { error: 'cross-origin-write-blocked' });
    return;
  }
  const url = new URL(request.url || '/', `http://${host}:${port}`);

  if (url.pathname === '/api/state' && request.method === 'GET') {
    sendJson(response, 200, currentState);
    return;
  }

  if (url.pathname === '/api/state' && request.method === 'PUT') {
    if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      sendJson(response, 415, { error: 'json-required' });
      return;
    }
    try {
      const next = await readBody(request);
      if (isStaleState(currentState, next)) {
        sendJson(response, 409, { error: 'stale-state' });
        return;
      }
      const merged = mergeStateSections(currentState, next);
      await saveState(merged);
      currentState = merged;
      broadcast(merged);
      sendJson(response, 200, merged);
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

  if (url.pathname === '/api/copy-obs-url' && request.method === 'POST') {
    try {
      await copyObsUrl();
      response.writeHead(204, { 'Cache-Control': 'no-store' });
      response.end();
    } catch {
      sendJson(response, 500, { error: 'clipboard-unavailable' });
    }
    return;
  }

  if (!(await serveStatic(url.pathname, response))) {
    sendJson(response, 503, { error: 'build-not-found', hint: 'Run npm run build first.' });
  }
});

server.listen(port, host, () => {
  console.log(`StudyDot local server: http://${host}:${port}`);
});
