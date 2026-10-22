// Las pruebas de validación (validacion/) con la ventana de Edge visible y un poco más
// lentas, para poder seguirlas. Usan la misma base, API y app compilada que las pruebas de pantalla.
//   npm run e2e:validacion                       desde la raíz
//   E2E_LENTO=0 npm run e2e:validacion           a velocidad normal (ms entre acciones; 450 por omisión)
//   E2E_OCULTO=1 npm run e2e:validacion          sin ventana
import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

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
});
