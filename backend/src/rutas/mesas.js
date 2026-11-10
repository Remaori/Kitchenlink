// /api/mesas · 04 Mesas y 05a Mis mesas
//   Consultar: quien ve el salón, atiende mesas o recibe clientes.
//   Crear, editar, bloquear: «Crear y bloquear mesas».
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import { exigirModulo } from '../cronograma.js';
import * as mesas from '../servicios/mesas.js';
import { cambia, id, tiene, yo } from './ayudantes.js';

const router = Router();
router.use(autenticar());

const mesa = id('mesa');
const consulta = exigirPermiso('mesa.ver', 'mesa.administrar', 'comanda.abrir', 'reservacion.gestionar');
const administra = exigirPermiso('mesa.administrar');

router.get('/', consulta, async (req, res) => res.json(await mesas.mapa({ conBajas: tiene(req, 'mesa.administrar') })));
router.get('/:id', consulta, async (req, res) => res.json(await mesas.detalle(mesa(req))));

// Crear mesa (cronograma: 21 oct)
router.post('/', administra, cambia(['mesas'], (req) => mesas.crear(req.body, yo(req)), 201));
router.put('/:id', administra, cambia(['mesas'], (req) => mesas.editar(mesa(req), req.body, yo(req))));
router.post('/:id/dar-de-baja', administra, cambia(['mesas'], (req) => mesas.darDeBaja(mesa(req), yo(req))));
router.post('/:id/reactivar', administra, cambia(['mesas'], (req) => mesas.reactivar(mesa(req), yo(req))));

// Operaciones de mesas: bloqueo (cronograma: 27 y 28 oct)
const operaciones = exigirModulo('operaciones_mesas');
router.post('/:id/bloquear', operaciones, administra, cambia(['mesas'], (req) => mesas.bloquear(mesa(req), req.body, yo(req))));
router.post('/:id/desbloquear', operaciones, administra, cambia(['mesas'], (req) => mesas.desbloquear(mesa(req), yo(req))));

export default router;
