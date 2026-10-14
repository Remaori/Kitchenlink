// Ayudantes de los routers de operación
import { idDeRuta } from '../validacion.js';

export const yo = (req) => req.sesion.usuario.id;
export const tiene = (req, clave) => req.sesion.permisos.some((p) => p.clave === clave);
export const id = (que) => (req) => idDeRuta(req.params.id, que);

/** Responde con lo que devuelve `fn(req)`; `temas` dice qué cambió (menú, mesas). */
export const cambia = (_temas, fn, estado = 200) => async (req, res) => {
  res.status(estado).json(await fn(req));
};
