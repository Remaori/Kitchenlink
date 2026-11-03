// 05b · "Cancelar comanda · requiere autorización del gerente"
//
// La cancelación se registra con quién la pidió y quién la autorizó (tabla
// cancelacion; la base exige que quien autoriza tenga «Cancelar productos o
// comandas»). En la tablet del mesero el gerente escribe su usuario y
// contraseña; si quien cancela ya tiene el permiso, se autoriza a sí mismo.
// Los intentos fallidos cuentan en el mismo límite que el inicio de sesión.
import { consulta } from '../db.js';
import { ErrorHttp } from '../errores.js';
import * as pw from '../seguridad/contrasenas.js';
import * as limitador from '../seguridad/limitador.js';

const PERMISO = 'comanda.cancelar';

export async function tienePermisoEnBase(usuarioId, clave) {
  const { rows: [r] } = await consulta('SELECT fn_tiene_permiso($1, $2) AS si', [usuarioId, clave]);
  return r.si;
}

/** Devuelve el id de quien autoriza, o lanza 403 con el motivo. */
export async function quienAutoriza(actorId, autoriza, ip) {
  if (await tienePermisoEnBase(actorId, PERMISO)) return actorId;
  const usuario = typeof autoriza?.usuario === 'string' ? autoriza.usuario.trim() : '';
  const contrasena = typeof autoriza?.contrasena === 'string' ? autoriza.contrasena : '';
  if (!usuario || !contrasena) {
    throw new ErrorHttp(403, 'AUTORIZACION_REQUERIDA', 'Para cancelar, el gerente escribe su usuario y contraseña.',
      { campos: { autoriza: 'Falta la autorización del gerente.' } });
  }
  // El intento cuenta desde ya: varios a la vez no se saltan el límite
  const intento = limitador.reservarIntento(ip, usuario);
  if (intento.espera) throw new ErrorHttp(429, 'DEMASIADOS_INTENTOS', `Demasiados intentos fallidos. Espera ${intento.espera} min.`);
  const { rows: [u] } = await consulta(
    `SELECT u.id, u.nombre_completo, u.contrasena_hash, u.estado::text AS estado, r.nombre AS rol
     FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE lower(u.nombre_usuario) = lower($1)`, [usuario]);
  const correcta = u ? await pw.comparar(contrasena, u.contrasena_hash).catch(() => false) : await pw.compararConRelleno(contrasena);
  if (!u || !correcta || u.estado !== 'activo') {
    throw new ErrorHttp(403, 'AUTORIZACION_INVALIDA', 'Usuario o contraseña de quien autoriza incorrectos.',
      { campos: { autoriza: 'Usuario o contraseña incorrectos.' } });
  }
  limitador.devolverIntento(ip, usuario, intento.ahora);
  limitador.limpiar(ip, usuario);
  if (!(await tienePermisoEnBase(u.id, PERMISO))) {
    throw new ErrorHttp(403, 'AUTORIZACION_INVALIDA', `${u.nombre_completo} (${u.rol}) no puede autorizar cancelaciones.`,
      { campos: { autoriza: `${u.rol} no tiene el permiso «Cancelar productos o comandas».` } });
  }
  return u.id;
}
