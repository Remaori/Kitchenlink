import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, Vite sirve la app en :5173 y manda /api al backend en :3000
// (lo mismo que hará Nginx en la presentación). xfwd = pasa la IP real del
// dispositivo al backend para registrarla en la sesión.
const proxy = { '/api': { target: 'http://127.0.0.1:3000', xfwd: true } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
});
