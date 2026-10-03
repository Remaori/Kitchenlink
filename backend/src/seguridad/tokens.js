// Sesiones: JWT firmado en una cookie httpOnly + fila en la tabla sesion.
//
// El JWT lleva el id de la sesión (sid) y un secreto al azar (jti). En la
// tabla sesion se guarda solo el SHA-256 del jti: con una copia de la
// base no se puede fabricar una sesión válida. Como cada petición revisa
// la fila, cerrar sesión o dar de baja al usuario corta el acceso al
// instante (aunque el JWT todavía no haya vencido).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const COOKIE = 'kl_sesion';
const EMISOR = 'kitchenlink';

export const nuevoJti = () => crypto.randomBytes(32).toString('base64url');
export const hashJti = (jti) => crypto.createHash('sha256').update(jti).digest('hex');

export function firmar({ usuarioId, sesionId, jti, expiraEn }) {
  const exp = Math.floor(new Date(expiraEn).getTime() / 1000);
  return jwt.sign({ sid: sesionId, jti, exp }, config.jwtSecreto, {
    algorithm: 'HS256', subject: String(usuarioId), issuer: EMISOR,
  });
}

// Devuelve { usuarioId, sesionId, jti } o null si el token no es válido
export function verificar(token) {
  try {
    const p = jwt.verify(token, config.jwtSecreto, { algorithms: ['HS256'], issuer: EMISOR });
    const usuarioId = Number(p.sub);
    if (!Number.isInteger(usuarioId) || !Number.isInteger(p.sid) || typeof p.jti !== 'string') return null;
    return { usuarioId, sesionId: p.sid, jti: p.jti };
  } catch {
    return null;
  }
}

export function opcionesCookie(expiraEn) {
  return {
    httpOnly: true,                 // JavaScript del navegador no la puede leer
    sameSite: 'strict',             // no viaja en peticiones desde otros sitios
    secure: config.cookieSegura,    // true detrás de Nginx con HTTPS
    path: '/',
    ...(expiraEn ? { expires: new Date(expiraEn) } : {}),
  };
}
