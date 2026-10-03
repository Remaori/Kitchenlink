// Errores HTTP y traducción de los errores de PostgreSQL a respuestas JSON
import { config } from './config.js';

export class ErrorHttp extends Error {
  constructor(estado, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.extra = extra;
  }
}

// Los triggers de la base explican en español qué regla se rompió
// (ej. "Faltan $120.00 por cobrar…"). Esos mensajes están pensados para
// mostrarse en pantalla, así que se devuelven tal cual.
function desdePostgres(err) {
  switch (err.code) {
    case 'P0001':
      return new ErrorHttp(409, 'REGLA_DE_NEGOCIO', err.message, err.detail ? { detalle: err.detail } : {});
    case '42501':
      // Nuestras funciones lanzan 42501 con un mensaje en español.
      // "permission denied for table…" es un permiso de GRANT que falta: error del backend.
      if (/^(permission denied|permiso denegado)/i.test(err.message)) return null;
      return new ErrorHttp(403, 'SIN_PERMISO', err.message, err.detail ? { detalle: err.detail } : {});
    case '23505':
      return new ErrorHttp(409, 'DUPLICADO', 'Ya existe un registro con ese valor.', { restriccion: err.constraint });
    case '23503':
      return new ErrorHttp(409, 'REFERENCIA', 'El registro está relacionado con otro que no existe o que lo usa.', { restriccion: err.constraint });
    case '23514':
      return new ErrorHttp(409, 'REGLA_DE_DATOS', 'Los datos no cumplen una regla de la base.', { restriccion: err.constraint });
    case '22P02':
    case '22007':
    case '22008':
      return new ErrorHttp(400, 'DATO_INVALIDO', 'Algún dato no tiene el formato correcto.');
    default:
      return null;
  }
}

export function manejadorErrores(err, req, res, _next) {
  let e = err instanceof ErrorHttp ? err : null;
  if (!e && err?.type === 'entity.parse.failed') e = new ErrorHttp(400, 'JSON_INVALIDO', 'El cuerpo de la petición no es JSON válido.');
  if (!e && typeof err?.code === 'string') e = desdePostgres(err);
  if (!e) {
    console.error('[error]', req.method, req.originalUrl, err);
    e = new ErrorHttp(500, 'ERROR_INTERNO', 'Ocurrió un error en el servidor. Intenta de nuevo.');
    if (config.entorno === 'development') e.extra = { detalle: String(err?.message || err) };
  }
  res.status(e.estado).json({ codigo: e.codigo, mensaje: e.message, ...e.extra });
}

export function rutaNoEncontrada(req, _res, next) {
  next(new ErrorHttp(404, 'NO_ENCONTRADO', `No existe ${req.method} ${req.originalUrl}`));
}
