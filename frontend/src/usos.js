// Ganchos (hooks) que usan los formularios y botones de las pantallas
import { useState } from 'react';

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
