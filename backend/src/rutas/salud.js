// GET /api/salud · ¿El servidor responde y alcanza a la base? (prueba de conectividad)
import { Router } from 'express';
import { createRequire } from 'node:module';
import { consulta } from '../db.js';
import { config } from '../config.js';

const { version } = createRequire(import.meta.url)('../../package.json');
const router = Router();

router.get('/', async (_req, res) => {
  const inicio = process.hrtime.bigint();
  try {
    const { rows: [r] } = await consulta('SELECT fn_ahora() AS hora_base');
    const latencia = Number(process.hrtime.bigint() - inicio) / 1e6;
    res.json({
      estado: 'ok',
      servicio: 'kitchenlink-api',
      version,
      entorno: config.entorno,
      base_de_datos: { estado: 'conectada', latencia_ms: Math.round(latencia * 10) / 10, hora: r.hora_base },
    });
  } catch (err) {
    res.status(503).json({
      estado: 'sin_base_de_datos',
      servicio: 'kitchenlink-api',
      version,
      base_de_datos: { estado: 'sin conexión', error: err.code || err.message },
    });
  }
});

export default router;
