// Marco de la aplicación: menú lateral + la pantalla de la ruta.
// El menú se arma con los PERMISOS del rol (no con el nombre del rol),
// porque en 02c el gerente puede crear roles y cambiar sus casillas.
// Cada módulo aparece cuando llega el miércoles en que se revisa
// (interruptor por fecha del servidor); antes, quien tenga el permiso lo ve
// como "pronto".
import { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSesion } from '../sesion/ContextoSesion.jsx';
import { Logo } from './Campos.jsx';
import * as Ic from './Iconos.jsx';

const alguno = (...claves) => (t) => claves.some(t);
const caja = alguno('pago.registrar', 'ticket.pre_ticket');

// Orden pensado para que cada rol vea sus módulos en el orden del diseño.
// `ver(t)` decide con los permisos (t = tienePermiso); `modulo` es la clave del cronograma.
export const MODULOS = [
  { nombre: 'Reservaciones', icono: Ic.IconoCalendario, modulo: 'recepcion', ver: alguno('reservacion.gestionar'), ruta: '/reservaciones' },
  { nombre: 'Lista de espera', icono: Ic.IconoArena, modulo: 'recepcion', ver: alguno('reservacion.gestionar'), ruta: '/lista-espera' },
  { nombre: 'Cobro', icono: Ic.IconoRecibo, modulo: 'cobro', ver: caja, ruta: '/cobro' },
  // La cajera ve las cuentas abiertas de todas las mesas; el mesero las suyas en Comandas
  { nombre: 'Cuentas abiertas', icono: Ic.IconoLista, modulo: 'cobro', ver: (t) => caja(t) && !t('comanda.abrir'), ruta: '/cuentas' },
  { nombre: 'Cortes de caja', icono: Ic.IconoGrafica, modulo: 'ventas', ver: alguno('caja.corte', 'ticket.emitir'), ruta: '/ventas' },
  // Quien administra o solo consulta el salón ve el mapa completo (04); quien atiende mesas, "Mis mesas" (05a)
  { nombre: 'Mesas', icono: Ic.IconoMesa, modulo: 'mesas', ver: (t) => t('mesa.administrar') || (t('mesa.ver') && !t('comanda.abrir')), ruta: '/mesas' },
  { nombre: 'Mis mesas', icono: Ic.IconoMesa, modulo: 'operaciones_mesas', ver: (t) => t('comanda.abrir') && !t('mesa.administrar'), ruta: '/mis-mesas' },
  { nombre: 'Comandas', icono: Ic.IconoLista, modulo: 'comandas', ver: alguno('comanda.abrir'), ruta: '/comandas' },
  { nombre: 'Panel de cocina', icono: Ic.IconoCocina, modulo: 'produccion', ver: alguno('produccion.ver'), ruta: '/cocina' },
  { nombre: 'Barra', icono: Ic.IconoVaso, modulo: 'produccion', ver: alguno('produccion.ver'), ruta: '/barra' },
  {
    nombre: (t) => (t('menu.administrar') ? 'Menú y productos' : t('menu.asignar_86') ? 'Productos 86' : 'Menú'),
    icono: Ic.IconoMenu, modulo: 'menu', ver: alguno('menu.administrar', 'menu.asignar_86', 'comanda.abrir'), ruta: '/menu',
  },
  {
    nombre: 'Usuarios y roles', icono: Ic.IconoPersonas, modulo: 'seguridad', ver: alguno('usuario.administrar', 'rol.administrar'),
    ruta: (t) => (t('usuario.administrar') ? '/usuarios' : '/roles'),
    activo: (ruta) => /^\/(usuarios|roles)(\/|$)/.test(ruta),
  },
  { nombre: 'Reportes', icono: Ic.IconoGrafica, modulo: 'reportes', ver: alguno('reporte.ver'), ruta: '/reportes' },
];

export default function Marco() {
  const { datos, cerrarSesion, tienePermiso, moduloVisible, refrescar } = useSesion();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const { usuario } = datos;
  const modulos = MODULOS.filter((m) => m.ver(tienePermiso));

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
          {modulos.map(({ nombre, icono: Icono, ruta, activo, modulo }) => {
            const texto = typeof nombre === 'function' ? nombre(tienePermiso) : nombre;
            if (!moduloVisible(modulo)) {
              return (
                <span key={texto} className="deshabilitado" title="Se agrega en las siguientes tareas">
                  <Icono />{texto}<small>pronto</small>
                </span>
              );
            }
            const a = typeof ruta === 'function' ? ruta(tienePermiso) : ruta;
            const marcado = activo ? activo(pathname) : pathname === a || pathname.startsWith(`${a}/`);
            return <NavLink key={texto} to={a} className={marcado ? 'activo' : ''}><Icono />{texto}</NavLink>;
          })}
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
export function ConPermiso({ alguno: claves, children }) {
  const { tienePermiso } = useSesion();
  if (claves.some(tienePermiso)) return children;
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

/**
 * Pantalla de un módulo del cronograma: antes del miércoles en que se revisa
 * no existe (regresa al inicio); después, pide alguno de los permisos.
 */
export function Pantalla({ modulo, alguno: claves, children }) {
  const { moduloVisible } = useSesion();
  if (!moduloVisible(modulo)) return <Navigate to="/" replace />;
  return <ConPermiso alguno={claves}>{children}</ConPermiso>;
}
