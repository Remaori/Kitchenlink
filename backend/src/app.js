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
import rutasProduccion from './rutas/produccion.js';
import { rutasCaja, rutasVentas, rutasReportes } from './rutas/caja.js';
import { ahora } from './reloj.js';
import { exigirModulo } from './cronograma.js';

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
  // (espera, cocina, tolerancia) con ella y no con el reloj de cada tablet.
  app.use((_req, res, next) => { res.set('X-Ahora', ahora().toISOString()); next(); });

  app.use('/api/salud', rutasSalud);
  app.use('/api/auth', rutasAuth);
  app.use('/api/usuarios', rutasUsuarios);
  app.use('/api/roles', rutasRoles);
  // Módulos del cronograma: cada uno aparece el miércoles en que se revisa (cronograma.js)
  app.use('/api/menu', exigirModulo('menu'), rutasMenu);
  app.use('/api/mesas', exigirModulo('mesas'), rutasMesas);
  app.use('/api/reservaciones', exigirModulo('recepcion'), reservaciones);
  app.use('/api/lista-espera', exigirModulo('recepcion'), listaEspera);
  app.use('/api/comandas', rutasComandas); // cada ruta revisa su módulo: comandas, operaciones de mesas o historial
  app.use('/api/produccion', exigirModulo('produccion'), rutasProduccion);
  app.use('/api/caja', exigirModulo('cobro'), rutasCaja);
  app.use('/api/ventas', exigirModulo('ventas'), rutasVentas);
  app.use('/api/reportes', exigirModulo('reportes'), rutasReportes);
  app.use('/api', rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}
