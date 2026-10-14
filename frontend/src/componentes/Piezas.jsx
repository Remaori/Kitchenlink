// Piezas de las pantallas de operación: insignias de estado, pestañas,
// interruptores y avisos. Colores y medidas del diseño.
import * as Ic from './Iconos.jsx';

/** Insignia con punto: el texto y el tono vienen de etiqueta_estado de la base. */
export const Insignia = ({ tono = 'gray', children, className = '' }) => (
  <span className={`insignia ${tono} ${className}`}>{children}</span>
);

/** Pestañas que cambian de vista dentro de la misma pantalla */
export function Pestanas({ opciones, valor, alCambiar }) {
  return (
    <nav className="pestanas" aria-label="Secciones">
      {opciones.map(([v, texto]) => (
        <button key={v} type="button" className={v === valor ? 'activa' : ''} aria-current={v === valor || undefined}
          onClick={() => alCambiar(v)}>{texto}</button>
      ))}
    </nav>
  );
}

/** Interruptor de dos o tres opciones ("Cocina | Barra") */
export function Segmentos({ opciones, valor, alCambiar, etiqueta, chico }) {
  return (
    <div className={`segmentos${chico ? ' chico' : ''}`} role="group" aria-label={etiqueta}>
      {opciones.map(([v, texto]) => (
        <button key={v} type="button" className={v === valor ? 'activo' : ''} aria-pressed={v === valor}
          onClick={() => alCambiar(v)}>{texto}</button>
      ))}
    </div>
  );
}

/** Recuadro gris de explicación (los textos de ayuda del diseño) */
export const Explicacion = ({ icono: Icono = Ic.IconoInfo, tono = '', children }) => (
  <div className={`explicacion ${tono}`}>
    <Icono width={17} height={17} />
    <div>{children}</div>
  </div>
);

/** Buscador con lupa */
export const Buscador = ({ valor, alCambiar, texto, className = '' }) => (
  <div className={`entrada con-icono-izq buscador ${className}`}>
    <Ic.IconoBuscar className="entrada-icono-izq" />
    <input type="search" placeholder={texto} value={valor} onChange={(e) => alCambiar(e.target.value)} aria-label={texto} />
  </div>
);

export const Cargando = ({ texto = 'Cargando…' }) => <p className="texto-tenue">{texto}</p>;
