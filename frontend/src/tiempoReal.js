// Pantallas que se mantienen al día: cada pantalla abierta vuelve a pedir sus datos
// cada cierto tiempo (y después de cada acción). Los avisos en tiempo real con
// Socket.IO (ver docs/ARQUITECTURA.md) se conectan aquí mismo, sin cambiar las pantallas.
import { useEffect, useRef } from 'react';

/** Llama a `recargar()` cada `respaldoMs`. `temas` dice qué datos muestra la pantalla. */
export function useCambios(temas, recargar, { respaldoMs = 30_000 } = {}) {
  const fn = useRef(recargar);
  fn.current = recargar;
  const clave = temas.join(',');
  useEffect(() => {
    const respaldo = setInterval(() => fn.current(), respaldoMs);
    return () => clearInterval(respaldo);
  }, [clave, respaldoMs]);
}
