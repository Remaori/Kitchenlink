// /api/comandas · 05a Mis mesas: operaciones de mesas sobre una comanda abierta
//   «Abrir y modificar comandas» (y la base revisa que sea su mesero o el gerente).
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import * as comandas from '../servicios/comandas.js';
import { cambia, id, yo } from './ayudantes.js';

const router = Router();
router.use(autenticar());

const comanda = id('comanda');
const trabaja = exigirPermiso('comanda.abrir');

router.put('/:id/mesa', trabaja, cambia(['comandas', 'mesas'], (req) => comandas.cambiarMesa(comanda(req), req.body, yo(req))));
router.put('/:id/personas', trabaja, cambia(['comandas', 'mesas'], (req) => comandas.cambiarPersonas(comanda(req), req.body, yo(req))));

export default router;
