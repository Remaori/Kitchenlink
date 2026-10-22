// Aplicación Express (sin levantar el servidor: así la usan también las pruebas)
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { manejadorErrores, rutaNoEncontrada } from './errores.js';
import rutasSalud from './rutas/salud.js';
import rutasAuth from './seguridad/rutas.js';
import rutasUsuarios from './rutas/usuarios.js';
import rutasRoles from './rutas/roles.js';
import rutasMenu from './rutas/menu.js';
import rutasMesas from './rutas/mesas.js';
import { reservaciones, listaEspera } from './rutas/recepcion.js';
import rutasComandas from './rutas/comandas.js';
import { ahora } from './reloj.js';

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

  // Hora de la aplicación en cada respuesta: las pantallas cuentan los minutos
  // (espera, tolerancia) con ella y no con el reloj de cada tablet.
  app.use((_req, res, next) => { res.set('X-Ahora', ahora().toISOString()); next(); });

  app.use('/api/salud', rutasSalud);
  app.use('/api/auth', rutasAuth);
  app.use('/api/usuarios', rutasUsuarios);
  app.use('/api/roles', rutasRoles);
  app.use('/api/menu', rutasMenu);
  app.use('/api/mesas', rutasMesas);
  app.use('/api/reservaciones', reservaciones);
  app.use('/api/lista-espera', listaEspera);
  app.use('/api/comandas', rutasComandas);
  app.use('/api', rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}
