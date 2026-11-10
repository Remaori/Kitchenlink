// Interruptor por fecha del cronograma.
//
// Cada tarea de construcción del cronograma (ProjectLibre) es un módulo de la
// aplicación. Un módulo aparece el miércoles en que se revisa: el primer
// miércoles a partir de que empieza su tarea (si empieza en miércoles, ese
// mismo día). Antes de esa fecha no sale en el menú y su API responde 404,
// como si no existiera.
//
// La fecha de corte es hoy; FECHA_REVISION=AAAA-MM-DD la cambia (para ensayar
// una revisión antes, o ver todo con 2026-12-09). La ponen `npm run demo:todo`
// y `npm run demo -- --fecha AAAA-MM-DD` (scripts/dev.mjs), o backend/.env.
// `npm run cronograma` muestra qué se ve en cada fecha.
import { config } from './config.js';
import { ErrorHttp } from './errores.js';
import { hoyReal } from './reloj.js';

const MIERCOLES = 3;

/** AAAA-MM-DD del primer miércoles en o después de `fecha`. */
export function primerMiercoles(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((MIERCOLES - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

// Tareas de construcción del cronograma, en orden. "Gestionar modificadores"
// (20 oct) no está: el esquema v3 quitó los modificadores.
export const TAREAS = [
  { clave: 'seguridad', tarea: 'Iniciar sesión, Administrar roles y Administrar usuarios', pantallas: '01, 01b, 02a, 02b, 02c', inicio: '2026-10-07', fin: '2026-10-15', siempre: true },
  { clave: 'menu', tarea: 'Gestionar menú, categorías y productos', pantallas: '09', inicio: '2026-10-16', fin: '2026-10-19' },
  { clave: 'mesas', tarea: 'Crear mesa', pantallas: '04', inicio: '2026-10-21', fin: '2026-10-21' },
  { clave: 'recepcion', tarea: 'Gestión de reservaciones y tiempos de espera', pantallas: '03a, 03b', inicio: '2026-10-22', fin: '2026-10-26' },
  { clave: 'operaciones_mesas', tarea: 'Operaciones de mesas (cambio de mesa o de personas, bloqueo)', pantallas: '04, 05a', inicio: '2026-10-27', fin: '2026-10-28' },
  { clave: 'comandas', tarea: 'Gestionar comanda', pantallas: '05a, 05b', inicio: '2026-10-29', fin: '2026-11-03' },
  { clave: 'produccion', tarea: 'Consultar comandas pendientes y cambiar estado', pantallas: '06', inicio: '2026-11-04', fin: '2026-11-06' },
  { clave: 'historial_comandas', tarea: 'Consultar historial de comandas', pantallas: 'Comandas', inicio: '2026-11-09', fin: '2026-11-10' },
  { clave: 'monitoreo', tarea: 'Monitoreo de mesas', pantallas: '04', inicio: '2026-11-11', fin: '2026-11-12' },
  { clave: 'cobro', tarea: 'Gestión de pagos y cobro', pantallas: '07', inicio: '2026-11-13', fin: '2026-11-18' },
  { clave: 'ventas', tarea: 'Historial de ventas (cortes de mesero y cortes Z)', pantallas: '08', inicio: '2026-11-19', fin: '2026-11-23' },
  { clave: 'reportes', tarea: 'Supervisión y reportes', pantallas: '10', inicio: '2026-11-24', fin: '2026-11-25' },
].map((t) => ({ ...t, revision: primerMiercoles(t.inicio) }));

const POR_CLAVE = Object.fromEntries(TAREAS.map((t) => [t.clave, t]));

/** Fecha con la que se decide qué se ve: FECHA_REVISION o la fecha real de hoy. */
export const fechaDeCorte = () => config.fechaRevision || hoyReal();

export function habilitado(clave, fecha = fechaDeCorte()) {
  const t = POR_CLAVE[clave];
  if (!t) throw new Error(`No existe el módulo "${clave}" en el cronograma.`);
  return t.siempre || t.revision <= fecha;
}

export const modulosHabilitados = (fecha = fechaDeCorte()) => TAREAS.filter((t) => habilitado(t.clave, fecha)).map((t) => t.clave);

/** Middleware: si el módulo todavía no se revisa, la ruta "no existe" (404). */
export function exigirModulo(clave) {
  habilitado(clave); // falla al arrancar si la clave está mal escrita
  return (req, _res, next) => {
    if (habilitado(clave)) return next();
    next(new ErrorHttp(404, 'NO_ENCONTRADO', `No existe ${req.method} ${req.originalUrl}`));
  };
}
