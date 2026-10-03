// 01 · Iniciar sesión
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../sesion/ContextoSesion.jsx';
import { Alerta, Campo, CampoContrasena, Logo } from '../componentes/Campos.jsx';
import { IconoInfo, IconoUsuario } from '../componentes/Iconos.jsx';

export default function IniciarSesion() {
  const { iniciarSesion, aviso } = useSesion();
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    if (!usuario.trim() || !contrasena) { setError('Escribe tu usuario y tu contraseña.'); return; }
    setEnviando(true);
    try {
      const datos = await iniciarSesion(usuario, contrasena);
      navegar(datos.usuario.requiere_cambio_pw ? '/cambiar-contrasena' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setContrasena('');
      setEnviando(false);
    }
  }

  return (
    <main className="pantalla-centrada">
      <form className="tarjeta-acceso" onSubmit={enviar} noValidate>
        <Logo />
        <h1 className="acceso-titulo">KitchenLink</h1>
        <p className="acceso-subtitulo">Sistema de gestión de restaurante</p>

        <div className="acceso-campos">
          <Campo etiqueta="Usuario" placeholder="Nombre de usuario" value={usuario} autoFocus
            autoComplete="username" autoCapitalize="none" spellCheck={false}
            onChange={(e) => { setUsuario(e.target.value); setError(null); }} icono={<IconoUsuario />} />
          <CampoContrasena etiqueta="Contraseña" placeholder="••••••••••" value={contrasena}
            autoComplete="current-password" onChange={(e) => { setContrasena(e.target.value); setError(null); }} />
        </div>

        <Alerta>{error || aviso}</Alerta>

        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Iniciar sesión'}
        </button>

        <div className="nota">
          <IconoInfo width={16} height={16} />
          <span>¿No puedes entrar? Pide al gerente que restablezca tu contraseña.</span>
        </div>
        <p className="acceso-pie">Versión 1.0 · Uso interno del restaurante</p>
      </form>
    </main>
  );
}
