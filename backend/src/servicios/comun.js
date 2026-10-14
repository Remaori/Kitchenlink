// Ayudantes que comparten los servicios de las pantallas de operación
import { ErrorHttp } from '../errores.js';

/** Regla del negocio que revisa el backend (la pantalla muestra el texto tal cual). */
export const regla = (mensaje, extra) => new ErrorHttp(409, 'REGLA_DE_NEGOCIO', mensaje, extra);

export const noExiste = (que) => new ErrorHttp(404, 'NO_ENCONTRADO', `No existe ${que}.`);

/** Dato del formulario rechazado, con el campo para marcarlo en pantalla. */
export const campoInvalido = (campo, mensaje, codigo = 'DATOS_INVALIDOS', estado = 400) =>
  new ErrorHttp(estado, codigo, mensaje, { campos: { [campo]: mensaje } });

/** Registro en la bitácora dentro de la transacción (quién lo hizo lo pone la base). */
export const bitacora = (c, entidad, id, accion, detalle) =>
  c.query('SELECT fn_bitacora($1, $2, $3, $4::jsonb)', [entidad, id, accion, detalle ? JSON.stringify(detalle) : null]);
