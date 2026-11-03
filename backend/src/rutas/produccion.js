// /api/produccion · 06 Panel de cocina y barra
//   Ver: «Ver el panel de cocina y barra». Mover tarjetas: «Cambiar el estado de los platillos»
//   (la base deja que el mesero marque Entregado).
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import * as produccion from '../servicios/produccion.js';
import { ErrorHttp } from '../errores.js';
import { cambia, id, yo } from './ayudantes.js';

const router = Router();
router.use(autenticar());

router.get('/:destino', exigirPermiso('produccion.ver'), async (req, res) => {
  if (!['cocina', 'barra'].includes(req.params.destino)) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El panel es de cocina o de barra.');
  res.json(await produccion.panel(req.params.destino));
});

router.post('/envios/:id/avanzar', exigirPermiso('produccion.cambiar_estado', 'comanda.abrir'),
  cambia(['produccion', 'comandas', 'mesas'], (req) => produccion.avanzar(id('envío')(req), req.body, yo(req))));

export default router;
