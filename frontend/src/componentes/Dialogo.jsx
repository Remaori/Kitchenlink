// Ventana modal para confirmar acciones (restablecer, dar de baja…) y mostrar detalles
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconoEquis } from './Iconos.jsx';

export function Dialogo({ titulo, children, acciones, alCerrar, ancho }) {
  const id = useId();
  const caja = useRef(null);
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') cerrar.current?.(); };
    window.addEventListener('keydown', tecla);
    // Foco en la ventana para que el teclado y los lectores de pantalla empiecen ahí
    (caja.current?.querySelector('[data-foco]') ?? caja.current)?.focus();
    return () => window.removeEventListener('keydown', tecla);
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
