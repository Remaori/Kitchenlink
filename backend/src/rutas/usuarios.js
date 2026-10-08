// /api/usuarios · 02a Usuarios y 02b Nuevo usuario (permiso «Administrar usuarios»)
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import { generarTemporal } from '../seguridad/contrasenas.js';
import * as usuarios from '../seguridad/usuarios.js';
import { idDeRuta } from '../validacion.js';

const router = Router();
router.use(autenticar(), exigirPermiso('usuario.administrar'));

const id = (req) => idDeRuta(req.params.id, 'usuario');
const yo = (req) => req.sesion.usuario.id;
// Las respuestas con contraseñas temporales no se guardan en ninguna caché
const sinCache = (res) => res.set('Cache-Control', 'no-store');

router.get('/', async (_req, res) => res.json(await usuarios.listar()));

// 02b · "Generar otra"
router.get('/contrasena-temporal', (_req, res) => sinCache(res).json({ temporal: generarTemporal() }));

router.get('/:id', async (req, res) => res.json(await usuarios.detalle(id(req))));
router.get('/:id/historial', async (req, res) => res.json(await usuarios.historial(id(req))));

router.post('/', async (req, res) => res.status(201).json(await usuarios.crear(req.body, yo(req))));
router.put('/:id', async (req, res) => res.json(await usuarios.editar(id(req), req.body, yo(req))));

router.post('/:id/restablecer-contrasena', async (req, res) =>
  sinCache(res).json(await usuarios.restablecerContrasena(id(req), yo(req))));
router.post('/:id/dar-de-baja', async (req, res) => res.json(await usuarios.darDeBaja(id(req), yo(req))));
router.post('/:id/reactivar', async (req, res) => res.json(await usuarios.reactivar(id(req), yo(req))));

export default router;
