// Límite de intentos fallidos de inicio de sesión (en memoria).
//   · Por usuario + equipo: INTENTOS_MAX en INTENTOS_VENTANA_MIN minutos.
//   · Por equipo (cualquier usuario): INTENTOS_MAX_EQUIPO, contra quien
//     prueba muchos nombres de usuario desde la misma tablet.
// Un inicio exitoso limpia el contador de ese usuario en ese equipo.
// Se reinicia si se reinicia el servidor: para un restaurante en red
// local es suficiente; no hace falta guardarlo en la base.
import { config } from '../config.js';

const registros = new Map(); // clave -> { fallas: number[] (timestamps) }

const ventanaMs = () => config.intentos.ventanaMin * 60_000;
const recientes = (clave, ahora) => {
  const r = registros.get(clave);
  if (!r) return [];
  r.fallas = r.fallas.filter((t) => ahora - t < ventanaMs());
  if (!r.fallas.length) registros.delete(clave);
  return r.fallas;
};
const claves = (ip, usuario) => [`u:${ip}|${String(usuario || '').toLowerCase()}`, `e:${ip}`];

// null si puede intentar; si no, minutos que debe esperar
export function minutosDeBloqueo(ip, usuario, ahora = Date.now()) {
  const [cu, ce] = claves(ip, usuario);
  const fu = recientes(cu, ahora);
  const fe = recientes(ce, ahora);
  let hasta = 0;
  if (fu.length >= config.intentos.maxPorUsuario) hasta = Math.max(hasta, fu[fu.length - config.intentos.maxPorUsuario] + ventanaMs());
  if (fe.length >= config.intentos.maxPorEquipo) hasta = Math.max(hasta, fe[fe.length - config.intentos.maxPorEquipo] + ventanaMs());
  return hasta > ahora ? Math.ceil((hasta - ahora) / 60_000) : null;
}

export function registrarFalla(ip, usuario, ahora = Date.now()) {
  for (const c of claves(ip, usuario)) {
    const r = registros.get(c) || { fallas: [] };
    r.fallas.push(ahora);
    registros.set(c, r);
  }
}

export function limpiar(ip, usuario) {
  registros.delete(claves(ip, usuario)[0]);
}

export function reiniciarTodo() { registros.clear(); }
