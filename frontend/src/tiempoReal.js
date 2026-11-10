// Tiempo real: el servidor avisa qué cambió ("comandas", "produccion"…) y cada
// pantalla abierta vuelve a pedir sus datos. Si se pierde la conexión, la
// pantalla igual se refresca sola cada cierto tiempo.
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

let socket = null;
const oyentes = new Set();

function conectar() {
  if (socket) return;
  socket = io({ path: '/socket.io', withCredentials: true, reconnectionDelayMax: 5000 });
  socket.on('cambio', ({ temas }) => { for (const o of oyentes) o(temas); });
  // Al reconectar puede que se haya perdido algún aviso: todos recargan
  socket.io.on('reconnect', () => { for (const o of oyentes) o(null); });
}

/** Al cerrar sesión: la próxima pantalla con sesión abre una conexión nueva (con su cookie). */
export function desconectar() {
  socket?.disconnect();
  socket = null;
}

/**
 * Llama a `recargar()` cuando el servidor avisa que cambió alguno de los
 * `temas`, y además cada `respaldoMs` por si se perdió un aviso.
 */
export function useCambios(temas, recargar, { respaldoMs = 30_000 } = {}) {
  const fn = useRef(recargar);
  fn.current = recargar;
  const clave = temas.join(',');
  useEffect(() => {
    conectar();
    const lista = clave.split(',');
    let espera = null;
    // Varios avisos seguidos (ej. enviar a cocina toca comandas y producción) = una sola recarga
    const oyente = (cambiados) => {
      if (cambiados && !cambiados.some((t) => lista.includes(t))) return;
      clearTimeout(espera);
      espera = setTimeout(() => fn.current(), 150);
    };
    oyentes.add(oyente);
    const respaldo = setInterval(() => fn.current(), respaldoMs);
    return () => {
      oyentes.delete(oyente);
      clearTimeout(espera);
      clearInterval(respaldo);
    };
  }, [clave, respaldoMs]);
}
