import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSesion } from './sesion/ContextoSesion.jsx';
import IniciarSesion from './paginas/IniciarSesion.jsx';
import CambiarContrasena from './paginas/CambiarContrasena.jsx';
import Inicio from './paginas/Inicio.jsx';
import Usuarios from './paginas/usuarios/Usuarios.jsx';
import FormularioUsuario from './paginas/usuarios/FormularioUsuario.jsx';
import Roles from './paginas/roles/Roles.jsx';
import Menu from './paginas/menu/Menu.jsx';
import Mesas from './paginas/mesas/Mesas.jsx';
import MisMesas from './paginas/mesas/MisMesas.jsx';
import Reservaciones from './paginas/recepcion/Reservaciones.jsx';
import ListaEspera from './paginas/recepcion/ListaEspera.jsx';
import Comandas from './paginas/comandas/Comandas.jsx';
import Comanda from './paginas/comandas/Comanda.jsx';
import Panel from './paginas/produccion/Panel.jsx';
import Cobro from './paginas/caja/Cobro.jsx';
import Ventas from './paginas/caja/Ventas.jsx';
import Reportes from './paginas/reportes/Reportes.jsx';
import Marco, { ConPermiso, Pantalla } from './componentes/Marco.jsx';
import { Logo } from './componentes/Campos.jsx';

// Reglas de navegación:
//   sin sesión                 -> 01 Iniciar sesión
//   con contraseña temporal    -> 01b (no puede ir a ningún otro lado)
//   con sesión normal          -> la aplicación
function Guardia({ children, requiere }) {
  const { cargando, datos } = useSesion();
  const ubicacion = useLocation();
  if (cargando) return <div className="pantalla-centrada"><Logo /></div>;
  const temporal = datos?.usuario.requiere_cambio_pw;
  const destino =
    !datos ? (requiere === 'sin-sesion' ? null : '/iniciar-sesion')
      : temporal ? (requiere === 'temporal' ? null : '/cambiar-contrasena')
        : (requiere === 'sesion' ? null : '/');
  if (destino && destino !== ubicacion.pathname) return <Navigate to={destino} replace />;
  return children;
}

const usuarios = (pantalla) => <ConPermiso alguno={['usuario.administrar']}>{pantalla}</ConPermiso>;
const roles = (pantalla) => <ConPermiso alguno={['rol.administrar']}>{pantalla}</ConPermiso>;

export default function App() {
  return (
    <Routes>
      <Route path="/iniciar-sesion" element={<Guardia requiere="sin-sesion"><IniciarSesion /></Guardia>} />
      <Route path="/cambiar-contrasena" element={<Guardia requiere="temporal"><CambiarContrasena /></Guardia>} />
      <Route element={<Guardia requiere="sesion"><Marco /></Guardia>}>
        <Route index element={<Inicio />} />
        {/* 02a, 02b · Usuarios */}
        <Route path="usuarios" element={usuarios(<Usuarios />)} />
        <Route path="usuarios/nuevo" element={usuarios(<FormularioUsuario key="nuevo" />)} />
        <Route path="usuarios/:id" element={usuarios(<FormularioUsuario />)} />
        {/* 02c · Roles y permisos */}
        <Route path="roles" element={roles(<Roles />)} />
        <Route path="roles/:id" element={roles(<Roles />)} />
        {/* Módulos del cronograma: cada uno aparece el miércoles en que se revisa */}
        {/* 09 · Menú y productos (también "Menú" del mesero y "Productos 86" de cocina) */}
        <Route path="menu" element={<Pantalla modulo="menu" alguno={['menu.administrar', 'menu.asignar_86', 'comanda.abrir', 'produccion.ver']}><Menu /></Pantalla>} />
        {/* 04 · Mesas (Crear mesa; después operaciones y monitoreo) */}
        <Route path="mesas" element={<Pantalla modulo="mesas" alguno={['mesa.ver', 'mesa.administrar', 'reservacion.gestionar']}><Mesas /></Pantalla>} />
        {/* 03a · Reservaciones y 03b · Lista de espera */}
        <Route path="reservaciones" element={<Pantalla modulo="recepcion" alguno={['reservacion.gestionar']}><Reservaciones /></Pantalla>} />
        <Route path="lista-espera" element={<Pantalla modulo="recepcion" alguno={['reservacion.gestionar']}><ListaEspera /></Pantalla>} />
        {/* 05a · Mis mesas (operaciones de mesas; abrir comanda desde Gestionar comanda) */}
        <Route path="mis-mesas" element={<Pantalla modulo="operaciones_mesas" alguno={['comanda.abrir']}><MisMesas /></Pantalla>} />
        {/* 05b · Comanda y la lista de comandas (con su historial) */}
        <Route path="comandas" element={<Pantalla modulo="comandas" alguno={['comanda.abrir']}><Comandas /></Pantalla>} />
        <Route path="comandas/:id" element={<Pantalla modulo="comandas" alguno={['comanda.abrir', 'reporte.ver']}><Comanda /></Pantalla>} />
        {/* 06 · Panel de cocina y barra */}
        <Route path="cocina" element={<Pantalla modulo="produccion" alguno={['produccion.ver']}><Panel key="cocina" destino="cocina" /></Pantalla>} />
        <Route path="barra" element={<Pantalla modulo="produccion" alguno={['produccion.ver']}><Panel key="barra" destino="barra" /></Pantalla>} />
        {/* 07 · Cobro y cuentas abiertas */}
        <Route path="cobro" element={<Pantalla modulo="cobro" alguno={['pago.registrar', 'ticket.pre_ticket']}><Cobro /></Pantalla>} />
        <Route path="cuentas" element={<Pantalla modulo="cobro" alguno={['pago.registrar', 'ticket.pre_ticket']}><Comandas caja /></Pantalla>} />
        {/* 08 · Historial de ventas y cortes Z */}
        <Route path="ventas" element={<Pantalla modulo="ventas" alguno={['caja.corte', 'ticket.emitir', 'reporte.ver']}><Ventas /></Pantalla>} />
        {/* 10 · Supervisión y reportes */}
        <Route path="reportes" element={<Pantalla modulo="reportes" alguno={['reporte.ver']}><Reportes /></Pantalla>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
