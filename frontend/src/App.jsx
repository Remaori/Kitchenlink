import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSesion } from './sesion/ContextoSesion.jsx';
import IniciarSesion from './paginas/IniciarSesion.jsx';
import CambiarContrasena from './paginas/CambiarContrasena.jsx';
import Inicio from './paginas/Inicio.jsx';
import Usuarios from './paginas/usuarios/Usuarios.jsx';
import FormularioUsuario from './paginas/usuarios/FormularioUsuario.jsx';
import Roles from './paginas/roles/Roles.jsx';
import Marco, { ConPermiso } from './componentes/Marco.jsx';
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
