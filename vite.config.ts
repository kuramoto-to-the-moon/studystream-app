import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const voiceAutoPauseEnabled = process.env.VITE_ENABLE_VOICE_AUTO_PAUSE === 'true';
const runningTests = process.env.VITEST === 'true';

export default defineConfig({
  plugins: [react()],
  // `public/` currently contains only the optional speech models and ONNX
  // runtime. Public beta builds intentionally omit those assets.
  publicDir: voiceAutoPauseEnabled ? 'public' : false,
  resolve: {
    // The experimental hook imports a Web Worker, which would otherwise make
    // Vite emit ONNX Runtime even though the feature flag is off. Keep the
    // implementation and its unit tests in the repository, but replace it
    // with a zero-cost hook in ordinary beta builds.
    alias: !voiceAutoPauseEnabled && !runningTests
      ? [{ find: './useAutoPause', replacement: fileURLToPath(new URL('./src/useAutoPause.disabled.ts', import.meta.url)) }]
      : [],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:47831',
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.mjs'],
  },
});
