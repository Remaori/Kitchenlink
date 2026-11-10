// La prueba temprana de validación (validacion/) con la ventana de Edge visible y un poco más
// lenta, para poder seguirla. Usa la misma base, API y app compilada que las pruebas de pantalla.
//   npm run e2e:validacion                       desde la raíz
//   E2E_LENTO=0 npm run e2e:validacion           a velocidad normal (ms entre acciones; 450 por omisión)
//   E2E_OCULTO=1 npm run e2e:validacion          sin ventana
import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Lo que se ve en el menú lo decide backend/.env (FECHA_REVISION), no "todo el cronograma"
const [api, web] = base.webServer;
const envApi = { ...api.env };
delete envApi.FECHA_REVISION;

export default defineConfig({
  ...base,
  testDir: './validacion',
  globalSetup: './validacion/limpiar-evidencias.js',
  outputDir: 'resultados-validacion',
  reporter: [['list']],
  use: {
    ...base.use,
    headless: process.env.E2E_OCULTO === '1',
    launchOptions: { slowMo: Number(process.env.E2E_LENTO ?? 450) },
  },
  webServer: [{ ...api, env: envApi }, web],
});
