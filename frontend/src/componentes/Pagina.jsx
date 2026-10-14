// Piezas comunes de las pantallas con menú lateral: encabezado, pestañas y avisos
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSesion } from '../sesion/ContextoSesion.jsx';
import { IconoPalomita } from './Iconos.jsx';

export function Encabezado({ titulo, subtitulo, migas, children }) {
  return (
    <header className="encabezado">
      <div>
        <h1>{titulo}</h1>
        {migas ? (
          <nav className="migas" aria-label="Ruta">
            {migas.map(([texto, a], i) => (
              <span key={texto}>{i > 0 && <span className="migas-sep" aria-hidden="true">›</span>}{a ? <Link to={a}>{texto}</Link> : texto}</span>
            ))}
          </nav>
        ) : <p>{subtitulo}</p>}
      </div>
      {children && <div className="encabezado-acciones">{children}</div>}
    </header>
  );
}

/** 02a / 02c · Pestañas "Usuarios" y "Roles y permisos" (cada una según su permiso) */
export function PestanasSeguridad() {
  const { tienePermiso } = useSesion();
  const pestanas = [
    tienePermiso('usuario.administrar') && ['/usuarios', 'Usuarios'],
    tienePermiso('rol.administrar') && ['/roles', 'Roles y permisos'],
  ].filter(Boolean);
  return (
    <nav className="pestanas" aria-label="Secciones">
      {pestanas.map(([a, texto]) => (
        <NavLink key={a} to={a} className={({ isActive }) => (isActive ? 'activa' : '')}>{texto}</NavLink>
      ))}
    </nav>
  );
}

/** Aviso verde de "listo" que se quita solo (los últimos 300 ms se desliza hacia arriba) */
export function AvisoExito({ texto, alTerminar }) {
  const [saliendo, setSaliendo] = useState(false);
  useEffect(() => {
    if (!texto) return undefined;
    setSaliendo(false);
    const sale = setTimeout(() => setSaliendo(true), 5700);
    const t = setTimeout(alTerminar, 6000);
    return () => { clearTimeout(sale); clearTimeout(t); };
  }, [texto, alTerminar]);
  if (!texto) return null;
  // key: un aviso nuevo vuelve a entrar aunque el anterior siga a la vista
  return <div key={texto} className={`aviso-exito${saliendo ? ' saliendo' : ''}`} role="status"><IconoPalomita width={16} height={16} />{texto}</div>;
}
