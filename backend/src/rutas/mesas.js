// /api/mesas · 04 Mesas
//   Consultar: quien ve el salón, atiende mesas o recibe clientes.
//   Crear, editar y dar de baja: «Crear y bloquear mesas».
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import * as mesas from '../servicios/mesas.js';
import { cambia, id, tiene, yo } from './ayudantes.js';

const router = Router();
router.use(autenticar());

const mesa = id('mesa');
const consulta = exigirPermiso('mesa.ver', 'mesa.administrar', 'comanda.abrir', 'reservacion.gestionar');
const administra = exigirPermiso('mesa.administrar');

router.get('/', consulta, async (req, res) => res.json(await mesas.mapa({ conBajas: tiene(req, 'mesa.administrar') })));

// Crear mesa
router.post('/', administra, cambia(['mesas'], (req) => mesas.crear(req.body, yo(req)), 201));
router.put('/:id', administra, cambia(['mesas'], (req) => mesas.editar(mesa(req), req.body, yo(req))));
router.post('/:id/dar-de-baja', administra, cambia(['mesas'], (req) => mesas.darDeBaja(mesa(req), yo(req))));
router.post('/:id/reactivar', administra, cambia(['mesas'], (req) => mesas.reactivar(mesa(req), yo(req))));

export default router;
