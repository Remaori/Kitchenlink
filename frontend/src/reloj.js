// Hora de la aplicación en el navegador.
//
// Cada respuesta de la API trae X-Ahora (la hora del servidor). Aquí se guarda
// la diferencia con el reloj de este dispositivo: así "Esperando 15 min" o
// "hace 4 min" salen igual en todas las tablets aunque alguna tenga la hora
// mal, y también cuando el servidor fija la hora (RELOJ_INICIO, ver backend/src/reloj.js).
import { useEffect, useState } from 'react';

let desfase = 0;

export function ajustarReloj(horaServidor) {
  const t = Date.parse(horaServidor);
  if (Number.isFinite(t)) desfase = t - Date.now();
}

export const ahora = () => new Date(Date.now() + desfase);

/** Vuelve a dibujar el componente cada `cadaMs` para que los minutos avancen solos. */
export function useAhora(cadaMs = 15_000) {
  const [t, setT] = useState(ahora);
  useEffect(() => {
    const i = setInterval(() => setT(ahora()), cadaMs);
    return () => clearInterval(i);
  }, [cadaMs]);
  return t;
}

/** Minutos completos entre `desde` y la hora de la aplicación (nunca negativos). */
export const minutosDesde = (desde, hasta = ahora()) =>
  desde ? Math.max(0, Math.floor((new Date(hasta) - new Date(desde)) / 60_000)) : null;
