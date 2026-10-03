import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSesion } from './sesion/ContextoSesion.jsx';
import IniciarSesion from './paginas/IniciarSesion.jsx';
import CambiarContrasena from './paginas/CambiarContrasena.jsx';
import Inicio from './paginas/Inicio.jsx';
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

export default function App() {
  return (
    <Routes>
      <Route path="/iniciar-sesion" element={<Guardia requiere="sin-sesion"><IniciarSesion /></Guardia>} />
      <Route path="/cambiar-contrasena" element={<Guardia requiere="temporal"><CambiarContrasena /></Guardia>} />
      <Route path="/*" element={<Guardia requiere="sesion"><Inicio /></Guardia>} />
    </Routes>
  );
}
