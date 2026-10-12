// Ventana modal para confirmar acciones (restablecer, dar de baja…) y mostrar detalles
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconoEquis } from './Iconos.jsx';

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Tab y Shift+Tab dan la vuelta dentro de la ventana: el foco no se va a la página de atrás
function mantenerFoco(e, caja) {
  const lista = [...caja.querySelectorAll(ENFOCABLES)];
  if (!lista.length) { e.preventDefault(); return; }
  const primero = lista[0];
  const ultimo = lista[lista.length - 1];
  const actual = document.activeElement;
  if (!caja.contains(actual)) {
    e.preventDefault();
    (e.shiftKey ? ultimo : primero).focus();
  } else if (e.shiftKey && (actual === primero || actual === caja)) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && actual === ultimo) {
    e.preventDefault();
    primero.focus();
  }
}

export function Dialogo({ titulo, children, acciones, alCerrar, ancho }) {
  const id = useId();
  const caja = useRef(null);
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;
  useEffect(() => {
    const previo = document.activeElement;
    const tecla = (e) => {
      if (e.key === 'Escape') cerrar.current?.();
      if (e.key === 'Tab' && caja.current) mantenerFoco(e, caja.current);
    };
    window.addEventListener('keydown', tecla);
    // Foco en la ventana para que el teclado y los lectores de pantalla empiecen ahí
    (caja.current?.querySelector('[data-foco]') ?? caja.current)?.focus();
    return () => {
      window.removeEventListener('keydown', tecla);
      // Al cerrar, el foco regresa a donde estaba (el botón que abrió la ventana)
      if (previo?.isConnected) previo.focus();
    };
  }, []);

  return createPortal(
    <div className="dialogo-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar?.(); }}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={caja}
        style={ancho ? { maxWidth: ancho } : undefined}>
        <div className="dialogo-encabezado">
          <h2 id={id}>{titulo}</h2>
          {alCerrar && <button className="boton-icono" onClick={alCerrar} aria-label="Cerrar"><IconoEquis /></button>}
        </div>
        <div className="dialogo-cuerpo">{children}</div>
        {acciones && <div className="dialogo-acciones">{acciones}</div>}
      </div>
    </div>,
    document.body,
  );
}
