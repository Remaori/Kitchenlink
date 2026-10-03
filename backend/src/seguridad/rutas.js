// /api/auth · Iniciar sesión, cambiar contraseña, cerrar sesión, sesión actual
import { Router } from 'express';
import * as servicio from './servicio.js';
import { autenticar } from './middleware.js';
import { COOKIE, opcionesCookie, verificar } from './tokens.js';
import { ErrorHttp } from '../errores.js';

const router = Router();

const respuesta = (r) => ({ usuario: r.usuario, permisos: r.permisos, sesion: { emitida_en: r.sesion.emitidaEn, expira_en: r.sesion.expiraEn } });

// 01 · Iniciar sesión
router.post('/iniciar-sesion', async (req, res) => {
  try {
    const r = await servicio.iniciarSesion({
      usuario: req.body?.usuario, contrasena: req.body?.contrasena,
      ip: req.ip, dispositivo: req.get('user-agent'),
    });
    res.cookie(COOKIE, r.sesion.token, opcionesCookie(r.sesion.expiraEn));
    res.json(respuesta(r));
  } catch (e) {
    if (e instanceof ErrorHttp && e.estado === 429) res.set('Retry-After', String(e.extra.reintentar_en_min * 60));
    throw e;
  }
});

// Sesión actual (la usa el frontend al abrir la página)
router.get('/sesion', autenticar({ permitirTemporal: true }), (req, res) => {
  res.json(respuesta(req.sesion));
});

// 01b · Guardar y entrar
router.post('/cambiar-contrasena', autenticar({ permitirTemporal: true }), async (req, res) => {
  const r = await servicio.cambiarContrasena({
    usuarioId: req.sesion.usuario.id,
    actual: req.body?.actual, nueva: req.body?.nueva, confirmacion: req.body?.confirmacion,
    ip: req.ip, dispositivo: req.get('user-agent'),
  });
  res.cookie(COOKIE, r.sesion.token, opcionesCookie(r.sesion.expiraEn));
  res.json(respuesta(r));
});

// Cerrar sesión (también "Cancelar y volver al inicio de sesión" de 01b).
// Si la sesión ya no era válida, solo borra la cookie.
router.post('/cerrar-sesion', async (req, res) => {
  const datos = req.cookies?.[COOKIE] && verificar(req.cookies[COOKIE]);
  if (datos) await servicio.cerrarSesion(datos);
  res.clearCookie(COOKIE, opcionesCookie());
  res.status(204).end();
});

export default router;
