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

/** Exige que el rol del usuario tenga marcada la casilla `clave` en 02c. */
export function exigirPermiso(clave) {
  return async (req, _res, next) => {
    if (req.sesion?.permisos.some((p) => p.clave === clave)) return next();
    const { rows: [p] } = await consulta('SELECT nombre FROM permiso WHERE clave = $1', [clave]);
    throw new ErrorHttp(403, 'SIN_PERMISO',
      `${req.sesion.usuario.rol} no tiene el permiso «${p ? p.nombre : clave}».`, { permiso: clave });
  };
}
