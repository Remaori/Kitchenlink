// Aplicación Express (sin levantar el servidor: así la usan también las pruebas)
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { manejadorErrores, rutaNoEncontrada } from './errores.js';
import rutasSalud from './rutas/salud.js';
import rutasAuth from './seguridad/rutas.js';
import rutasUsuarios from './rutas/usuarios.js';

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  // Nginx (o el proxy de Vite en desarrollo) corre en el mismo equipo:
  // confiar en su X-Forwarded-For para registrar la IP real del dispositivo.
  app.set('trust proxy', 'loopback');

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  if (config.entorno !== 'test') {
    app.use((req, res, next) => {
      const t = Date.now();
      res.on('finish', () => console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - t} ms)`));
      next();
    });
  }

  app.use('/api/salud', rutasSalud);
  app.use('/api/auth', rutasAuth);
  app.use('/api/usuarios', rutasUsuarios);
  app.use('/api', rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}
