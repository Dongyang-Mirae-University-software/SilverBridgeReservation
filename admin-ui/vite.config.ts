import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 상위 SilverBridgeReservation/.env 의 PORT (API 서버 포트) */
function readParentApiPort(): string {
  const envPath = path.join(__dirname, '..', '.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) {
        continue;
      }
      const eq = t.indexOf('=');
      if (eq === -1) {
        continue;
      }
      if (t.slice(0, eq).trim() !== 'PORT') {
        continue;
      }
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v || '6015';
    }
  } catch {
    // .env 없음
  }
  return '6015';
}

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 6017,
    allowedHosts: ['reservation.dmu.gosky.kr', 'admin.gosky.kr', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${readParentApiPort()}`,
        changeOrigin: true,
      },
    },
  },
});
