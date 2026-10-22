// Ganchos (hooks) que usan los formularios y botones de las pantallas
import { useEffect, useRef, useState } from 'react';

const NINGUNO = new Set();

/**
 * Lo que cambió desde la carga anterior de la pantalla (casi siempre por un aviso
 * en tiempo real), para iluminarlo un momento con la clase `recien`. La primera
 * carga no ilumina nada; `lista` vacía (undefined) = la pantalla empieza de nuevo.
 * `clave(x)` identifica al elemento y `firma(x)` resume lo que se ve de él.
 */
export function useRecientes(lista, clave, firma) {
  const anterior = useRef(null);
  const reloj = useRef(null);
  const [recientes, setRecientes] = useState(NINGUNO);
  useEffect(() => () => clearTimeout(reloj.current), []);
  useEffect(() => {
    if (!lista) { anterior.current = null; return; }
    const actual = new Map(lista.map((x) => [clave(x), firma(x)]));
    const previo = anterior.current;
    anterior.current = actual;
    if (!previo) return;
    const cambiaron = [...actual].filter(([k, f]) => previo.get(k) !== f).map(([k]) => k);
    if (!cambiaron.length) return;
    clearTimeout(reloj.current);
    setRecientes(new Set(cambiaron));
    reloj.current = setTimeout(() => setRecientes(NINGUNO), 1800);
  }, [lista]); // eslint-disable-line react-hooks/exhaustive-deps
  return (x) => (recientes.has(clave(x)) ? ' recien' : '');
}

/**
 * Formulario de un diálogo: guarda con `enviar(valores)`, pone el error de cada
 * campo debajo de él (400/409 con `campos`) o uno general, y al terminar llama
 * `alTerminar(respuesta)`.
 */
export function useFormulario(inicial, enviar, alTerminar) {
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const campo = (nombre) => (e) => {
    const v = e?.target ? e.target.value : e;
    setValores((x) => ({ ...x, [nombre]: v }));
    setErrores((x) => ({ ...x, [nombre]: undefined }));
  };
  async function guardar(e) {
    e?.preventDefault();
    setEnviando(true);
    setError(null);
    setErrores({});
    try {
      const r = await enviar(valores);
      setEnviando(false);
      alTerminar?.(r);
    } catch (x) {
      setErrores(x.cuerpo?.campos ?? {});
      if (!x.cuerpo?.campos) setError(x.message);
      setEnviando(false);
    }
  }
  return { valores, setValores, errores, error, setError, enviando, campo, guardar };
}

/** Acción de un solo clic (confirmar, marcar llegada…): guarda el error para mostrarlo. */
export function useAccion(alTerminar) {
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const hacer = async (fn, texto) => {
    setEnviando(true);
    setError(null);
    try {
      const r = await fn();
      setEnviando(false);
      alTerminar?.(typeof texto === 'function' ? texto(r) : texto, r);
      return r;
    } catch (e) {
      setError(e.message);
      setEnviando(false);
      return null;
    }
  };
  return { error, setError, enviando, hacer };
}
