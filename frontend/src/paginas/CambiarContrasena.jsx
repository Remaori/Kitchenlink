// 01b · Cambio de contraseña obligatorio
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../sesion/ContextoSesion.jsx';
import { Alerta, CampoContrasena } from '../componentes/Campos.jsx';
import { IconoLlave, IconoPalomita } from '../componentes/Iconos.jsx';

// Las mismas reglas que valida el servidor (backend/src/seguridad/contrasenas.js)
function reglas(nueva, confirmacion) {
  return [
    { texto: 'Al menos 8 caracteres', cumple: nueva.length >= 8 },
    { texto: 'Incluye al menos un número', cumple: /\d/.test(nueva) },
    { texto: 'Las dos contraseñas coinciden', cumple: nueva.length > 0 && nueva === confirmacion },
  ];
}

export default function CambiarContrasena() {
  const { datos, cambiarContrasena, cerrarSesion } = useSesion();
  const navegar = useNavigate();
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const u = datos.usuario;
  const lista = reglas(nueva, confirmacion);
  const valida = lista.every((r) => r.cumple);
  const primeraVez = u.estado === 'pendiente';

  async function enviar(e) {
    e.preventDefault();
    if (!valida) return;
    setError(null);
    setEnviando(true);
    try {
      await cambiarContrasena(nueva, confirmacion);
      navegar('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  async function cancelar() {
    await cerrarSesion();
    navegar('/iniciar-sesion', { replace: true });
  }

  return (
    <main className="pantalla-centrada">
      <form className="tarjeta-acceso" onSubmit={enviar} noValidate>
        <div className="icono-circulo"><IconoLlave /></div>
        <h1 className="acceso-titulo chico">{primeraVez ? 'Crea tu contraseña' : 'Crea tu nueva contraseña'}</h1>
        <p className="acceso-subtitulo">
          {primeraVez
            ? 'Es tu primer inicio de sesión. Por seguridad, crea una contraseña propia antes de continuar.'
            : 'El gerente restableció tu contraseña. Por seguridad, crea una propia antes de continuar.'}
        </p>

        <div className="ficha-usuario">
          <span className="avatar">{u.iniciales}</span>
          <div>
            <div className="ficha-nombre">{u.nombre_completo}</div>
            <div className="ficha-detalle">{u.nombre_usuario} · {u.rol}</div>
          </div>
        </div>

        <div className="acceso-campos">
          <CampoContrasena etiqueta="Nueva contraseña" value={nueva} autoFocus autoComplete="new-password"
            onChange={(e) => { setNueva(e.target.value); setError(null); }} />
          <CampoContrasena etiqueta="Confirmar nueva contraseña" value={confirmacion} autoComplete="new-password"
            onChange={(e) => { setConfirmacion(e.target.value); setError(null); }} />
        </div>

        <ul className="reglas" aria-live="polite">
          {lista.map((r) => (
            <li key={r.texto} className={r.cumple ? 'cumple' : ''}>
              <span className="regla-marca"><IconoPalomita width={11} height={11} strokeWidth={3} /></span>
              {r.texto}
            </li>
          ))}
        </ul>

        <Alerta>{error}</Alerta>

        <button type="submit" className="boton boton-primario" disabled={!valida || enviando}>
          {enviando ? 'Guardando…' : 'Guardar y entrar'}
        </button>
        <button type="button" className="boton-enlace" onClick={cancelar}>Cancelar y volver al inicio de sesión</button>
      </form>
    </main>
  );
}
