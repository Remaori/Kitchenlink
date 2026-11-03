// Ayudantes que comparten los servicios de las pantallas de operación
import { ErrorHttp } from '../errores.js';
import { enFila } from '../db.js';

/** Regla del negocio que revisa el backend (la pantalla muestra el texto tal cual). */
export const regla = (mensaje, extra) => new ErrorHttp(409, 'REGLA_DE_NEGOCIO', mensaje, extra);

export const noExiste = (que) => new ErrorHttp(404, 'NO_ENCONTRADO', `No existe ${que}.`);

/** Dato del formulario rechazado, con el campo para marcarlo en pantalla. */
export const campoInvalido = (campo, mensaje, codigo = 'DATOS_INVALIDOS', estado = 400) =>
  new ErrorHttp(estado, codigo, mensaje, { campos: { [campo]: mensaje } });

/**
 * La mesa, bloqueada hasta terminar la transacción (quien llegue al mismo tiempo
 * espera y ve cómo quedó) y en servicio: una mesa dada de baja no se reserva,
 * no se asigna a un grupo ni recibe comandas.
 */
export async function exigirMesaActiva(c, id, campo = 'mesa_id') {
  const { rows: [m] } = await c.query(
    'SELECT id, numero, capacidad, estado::text AS estado, activo FROM mesa WHERE id = $1 FOR UPDATE', [id]);
  if (!m) throw noExiste('esa mesa');
  if (!m.activo) throw campoInvalido(campo, `La Mesa ${m.numero} está dada de baja: elige otra.`, 'REGLA_DE_NEGOCIO', 409);
  return m;
}

/** Registro en la bitácora dentro de la transacción (quién lo hizo lo pone la base). */
export const bitacora = (c, entidad, id, accion, detalle) =>
  c.query('SELECT fn_bitacora($1, $2, $3, $4::jsonb)', [entidad, id, accion, detalle ? JSON.stringify(detalle) : null]);

/**
 * Siguiente folio con prefijo de configuración (C-1046, Z-0032). El candado
 * de la transacción hace que dos cajeras o dos meseros a la vez no saquen el mismo.
 */
export async function siguienteFolio(c, { tabla, clavePrefijo, prefijoDefecto, digitos }) {
  await enFila(c, `folio:${tabla}`);
  const { rows: [r] } = await c.query(
    `SELECT COALESCE(fn_config_txt($1), $2) AS prefijo,
            COALESCE(MAX(substring(folio FROM '(\\d+)$')::int), 0) + 1 AS n
     FROM ${tabla} WHERE folio LIKE COALESCE(fn_config_txt($1), $2) || '%'`, [clavePrefijo, prefijoDefecto]);
  return r.prefijo + String(r.n).padStart(digitos, '0');
}
