// /api/roles · 02c Roles y permisos (permiso «Administrar roles y permisos»)
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import * as roles from '../seguridad/roles.js';
import { idDeRuta } from '../validacion.js';

const router = Router();
router.use(autenticar());

const id = (req) => idDeRuta(req.params.id, 'rol');
const yo = (req) => req.sesion.usuario.id;

// Leer también lo necesita 02b: el selector de rol y "Lo que podrá hacer como…"
router.get('/', exigirPermiso('rol.administrar', 'usuario.administrar'), async (_req, res) => res.json(await roles.listar()));

router.use(exigirPermiso('rol.administrar'));
router.post('/', async (req, res) => res.status(201).json(await roles.crear(req.body, yo(req))));
router.put('/:id', async (req, res) => res.json(await roles.actualizar(id(req), req.body, yo(req))));
router.post('/:id/dar-de-baja', async (req, res) => res.json(await roles.darDeBaja(id(req), yo(req))));
router.post('/:id/reactivar', async (req, res) => res.json(await roles.reactivar(id(req), yo(req))));

export default router;
