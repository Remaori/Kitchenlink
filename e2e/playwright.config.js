// Pruebas de pantalla de punta a punta: un navegador real contra la app compilada,
// una API aparte y la base kitchenlink_e2e (recién instalada en cada corrida).
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { API, BASE, WEB } from './direcciones.js';

const RAIZ = path.resolve(import.meta.dirname, '..');

export default defineConfig({
  testDir: './pruebas',
  // Una sola base: las pruebas van en orden, como un turno del restaurante
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'reporte' }]],
  outputDir: 'resultados',
  use: {
    baseURL: WEB,
    // Edge de Windows, sin descargar navegadores. En otro equipo: E2E_NAVEGADOR=chrome,
    // o E2E_NAVEGADOR=chromium después de `npx playwright install chromium`.
    channel: process.env.E2E_NAVEGADOR || 'msedge',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // La base con los datos de demostración y la API a la hora de las pantallas (22 sep, 19:09, reloj detenido)
      command: 'node ../e2e/preparar-base.mjs && node src/server.js',
      cwd: path.join(RAIZ, 'backend'),
      url: `${API}/api/salud`,
      env: {
        DB_NAME: BASE, PORT: new URL(API).port, RELOJ_INICIO: '2026-09-22T19:09:00-06:00', RELOJ_CORRE: 'false',
      },
      timeout: 120_000,
      stdout: 'ignore',
    },
    {
      // La app compilada (como en el restaurante), con /api y /socket.io hacia la API de las pruebas
      command: `npm run build && node ../node_modules/vite/bin/vite.js preview --port ${new URL(WEB).port} --strictPort`,
      cwd: path.join(RAIZ, 'frontend'),
      url: WEB,
      env: { KL_API: API },
      timeout: 120_000,
      stdout: 'ignore',
    },
  ],
});
