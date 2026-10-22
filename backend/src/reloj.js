// Reloj de la aplicación.
//
// Normalmente es la hora real. Con RELOJ_INICIO en backend/.env la aplicación
// arranca en esa hora y el tiempo corre desde ahí: así los datos de demostración
// (martes 22 de septiembre, 19:09) se ven como en el diseño y los minutos de
// espera y tolerancias avanzan solos. Las pruebas lo fijan con fijarReloj().
//
// La base usa el mismo reloj: fn_ahora() lee kitchenlink.ahora, que db.js fija
// en cada consulta con la hora de aquí. Las sesiones (cookie y JWT) siempre
// vencen con la hora real del equipo.
import { config } from './config.js';

let arranque = Date.now();

/** Hora de la aplicación (Date). */
export function ahora() {
  const r = config.reloj;
  if (!r) return new Date();
  return new Date(r.corre ? r.inicio + (Date.now() - arranque) : r.inicio);
}

/** Lo que se le manda a la base en kitchenlink.ahora ('' = hora real). */
export const ahoraParaLaBase = () => (config.reloj ? ahora().toISOString() : '');

/** Pruebas: fija el reloj en una hora (detenido) o lo regresa a la hora real con null. */
export function fijarReloj(fecha, { corre = false } = {}) {
  config.reloj = fecha == null ? null : { inicio: new Date(fecha).getTime(), corre };
  arranque = Date.now();
}
