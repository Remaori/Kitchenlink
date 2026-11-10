// Ayudantes de los routers de operación
import { avisar } from '../tiempoReal.js';
import { idDeRuta } from '../validacion.js';

export const yo = (req) => req.sesion.usuario.id;
export const tiene = (req, clave) => req.sesion.permisos.some((p) => p.clave === clave);
export const id = (que) => (req) => idDeRuta(req.params.id, que);

/**
 * Responde con lo que devuelve `fn(req)` y avisa en tiempo real a las pantallas
 * que muestran esos temas (ver tiempoReal.js).
 */
export const cambia = (temas, fn, estado = 200) => async (req, res) => {
  const r = await fn(req);
  avisar(...temas);
  res.status(estado).json(r);
};
