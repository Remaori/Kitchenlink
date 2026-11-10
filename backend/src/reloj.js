// Reloj de la aplicación.
//
// Normalmente es la hora real. Con RELOJ_INICIO en backend/.env (demostración)
// la aplicación arranca en esa hora y el tiempo corre desde ahí: así los datos
// de las pantallas (martes 22 de septiembre, 19:09) se ven como en el diseño y
// los minutos de espera, tolerancias y tiempos de cocina avanzan solos.
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

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria del restaurante, con la hora real. */
export function hoyReal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}
