import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, Vite sirve la app en :5173 y manda /api al backend en :3000
// (lo mismo que hará Nginx en la presentación). xfwd = pasa la IP real del
// dispositivo al backend para registrarla en la sesión.
// KL_API: otra API (las pruebas de pantalla usan la suya en :3100).
const api = process.env.KL_API || 'http://127.0.0.1:3000';
const proxy = { '/api': { target: api, xfwd: true } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
});
