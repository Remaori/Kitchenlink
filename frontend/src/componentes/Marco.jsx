// Marco de la aplicación: menú lateral + la pantalla de la ruta.
// El menú se arma con los PERMISOS del rol (no con el nombre del rol),
// porque en 02c el gerente puede crear roles y cambiar sus casillas.
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSesion } from '../sesion/ContextoSesion.jsx';
import { Logo } from './Campos.jsx';
import * as Ic from './Iconos.jsx';

// `ruta` = módulo ya construido; los demás se muestran como "pronto"
const MODULOS = [
  { nombre: 'Mesas', icono: Ic.IconoMesa, permisos: ['mesa.ver', 'mesa.administrar'] },
  { nombre: 'Reservaciones', icono: Ic.IconoCalendario, permisos: ['reservacion.gestionar'] },
  { nombre: 'Comandas', icono: Ic.IconoLista, permisos: ['comanda.abrir'] },
  { nombre: 'Cocina y barra', icono: Ic.IconoCocina, permisos: ['produccion.ver'] },
  { nombre: 'Cobro', icono: Ic.IconoRecibo, permisos: ['pago.registrar', 'ticket.pre_ticket'] },
  { nombre: 'Cortes de caja', icono: Ic.IconoCaja, permisos: ['caja.corte'] },
  { nombre: 'Menú y productos', icono: Ic.IconoMenu, permisos: ['menu.administrar', 'menu.asignar_86'] },
  { nombre: 'Reportes', icono: Ic.IconoGrafica, permisos: ['reporte.ver'] },
  {
    nombre: 'Usuarios y roles', icono: Ic.IconoPersonas, permisos: ['usuario.administrar', 'rol.administrar'],
    ruta: (tiene) => (tiene('usuario.administrar') ? '/usuarios' : '/roles'),
    activo: (ruta) => /^\/(usuarios|roles)(\/|$)/.test(ruta),
  },
];

export default function Marco() {
  const { datos, cerrarSesion, tienePermiso, refrescar } = useSesion();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const { usuario } = datos;
  const modulos = MODULOS.filter((m) => m.permisos.some(tienePermiso));

  // Al cambiar de pantalla se releen los permisos: así el menú refleja los
  // cambios que el gerente haga en 02c sin tener que volver a entrar.
  useEffect(() => { refrescar(); }, [pathname, refrescar]);

  async function salir() {
    await cerrarSesion();
    navegar('/iniciar-sesion', { replace: true });
  }

  return (
    <div className="marco">
      <aside className="lateral">
        <div className="lateral-marca"><Logo tam={32} /><span>KitchenLink</span></div>
        <nav className="lateral-menu" aria-label="Módulos">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'activo' : '')}><Ic.IconoInicio />Inicio</NavLink>
          {modulos.map(({ nombre, icono: Icono, ruta, activo }) => (ruta ? (
            <NavLink key={nombre} to={ruta(tienePermiso)} className={activo(pathname) ? 'activo' : ''}>
              <Icono />{nombre}
            </NavLink>
          ) : (
            <span key={nombre} className="deshabilitado" title="Se agrega en las siguientes tareas">
              <Icono />{nombre}<small>pronto</small>
            </span>
          )))}
        </nav>
        <div className="lateral-perfil">
          <span className="avatar">{usuario.iniciales}</span>
          <div className="lateral-perfil-texto">
            <strong title={usuario.nombre_completo}>{usuario.rol}</strong>
            <small>Sesión activa</small>
          </div>
          <button className="boton-icono" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión"><Ic.IconoSalir /></button>
        </div>
      </aside>
      <div className="principal">
        <Outlet />
      </div>
    </div>
  );
}

/** Muestra la pantalla solo si el rol tiene alguno de los permisos. */
export function ConPermiso({ alguno, children }) {
  const { tienePermiso } = useSesion();
  if (alguno.some(tienePermiso)) return children;
  return (
    <div className="pantalla-centrada">
      <div className="tarjeta sin-permiso">
        <h2 className="tarjeta-titulo"><Ic.IconoCandado /> Sin acceso</h2>
        <p className="texto-tenue">Tu rol no tiene permiso para esta pantalla. Si lo necesitas, pídeselo al gerente.</p>
        <NavLink className="boton boton-secundario" to="/">Ir al inicio</NavLink>
      </div>
    </div>
  );
}
