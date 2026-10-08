// Protección de rutas: sesión válida y permisos del rol (02c)
import { ErrorHttp } from '../errores.js';
import { consulta } from '../db.js';
import { COOKIE, verificar, opcionesCookie } from './tokens.js';
import { cargarSesion } from './servicio.js';

/**
 * Exige una sesión válida. Deja en req.sesion = { usuario, permisos, sesion }.
 * Mientras el usuario tenga contraseña temporal, solo puede usar las rutas
 * que se montan con { permitirTemporal: true } (01b, cerrar sesión, ver su sesión).
 */
export function autenticar({ permitirTemporal = false } = {}) {
  return async (req, res, next) => {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new ErrorHttp(401, 'SIN_SESION', 'Inicia sesión para continuar.');
    const datos = verificar(token);
    const s = datos && (await cargarSesion(datos));
    if (!s) {
      res.clearCookie(COOKIE, opcionesCookie());
      throw new ErrorHttp(401, 'SESION_TERMINADA', 'Tu sesión terminó. Vuelve a iniciar sesión.');
    }
    if (s.usuario.requiere_cambio_pw && !permitirTemporal) {
      throw new ErrorHttp(403, 'CAMBIO_CONTRASENA_REQUERIDO', 'Antes de continuar, crea tu nueva contraseña.');
    }
    req.sesion = s;
    next();
  };
}

/**
 * Exige que el rol del usuario tenga marcada la casilla `clave` en 02c.
 * Con varias claves basta con una (ej. 02b lee los roles con «Administrar usuarios»).
 */
export function exigirPermiso(...claves) {
  return async (req, _res, next) => {
    if (req.sesion?.permisos.some((p) => claves.includes(p.clave))) return next();
    const { rows } = await consulta('SELECT nombre FROM permiso WHERE clave = ANY($1::text[]) ORDER BY orden', [claves]);
    const nombres = (rows.length ? rows.map((p) => p.nombre) : claves).map((n) => `«${n}»`).join(' ni ');
    throw new ErrorHttp(403, 'SIN_PERMISO',
      `${req.sesion.usuario.rol} no tiene el permiso ${nombres}.`, { permiso: claves.join(',') });
  };
}
