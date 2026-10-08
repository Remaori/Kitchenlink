// Inicio provisional después de iniciar sesión: quién eres, qué puedes hacer
// y si el servidor y la base responden. Los módulos se agregan en las
// siguientes tareas del cronograma.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSesion } from '../sesion/ContextoSesion.jsx';
import { hora } from '../formato.js';
import * as Ic from '../componentes/Iconos.jsx';

function EstadoSistema() {
  const [salud, setSalud] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get('/salud').then(setSalud).catch((e) => setError(e.message)); }, []);
  return (
    <section className="tarjeta">
      <h2 className="tarjeta-titulo"><Ic.IconoServidor /> Estado del sistema</h2>
      {error && <p className="texto-malo">{error}</p>}
      {!salud && !error && <p className="texto-tenue">Consultando…</p>}
      {salud && (
        <dl className="datos">
          <dt>Servidor (API)</dt><dd><span className="punto ok" />En línea · v{salud.version}</dd>
          <dt>Base de datos</dt>
          <dd><span className={`punto ${salud.base_de_datos.estado === 'conectada' ? 'ok' : 'malo'}`} />
            {salud.base_de_datos.estado === 'conectada' ? `Conectada · ${salud.base_de_datos.latencia_ms} ms` : 'Sin conexión'}</dd>
          <dt>Hora del servidor</dt><dd>{salud.base_de_datos.hora ? hora(salud.base_de_datos.hora) : '—'}</dd>
        </dl>
      )}
    </section>
  );
}

export default function Inicio() {
  const { datos, cerrarSesion } = useSesion();
  const navegar = useNavigate();
  const { usuario, permisos, sesion } = datos;
  const porModulo = permisos.reduce((acc, p) => ({ ...acc, [p.modulo]: [...(acc[p.modulo] || []), p.nombre] }), {});

  async function salir() {
    await cerrarSesion();
    navegar('/iniciar-sesion', { replace: true });
  }

  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Hola, {usuario.nombre_completo.split(' ')[0]}</h1>
          <p>{usuario.rol} · sesión iniciada a las {hora(sesion.emitida_en)} · vence a las {hora(sesion.expira_en)}</p>
        </div>
        <button className="boton boton-secundario" onClick={salir}><Ic.IconoSalir width={16} height={16} />Cerrar sesión</button>
      </header>

      <div className="contenido rejilla">
        <section className="tarjeta">
          <h2 className="tarjeta-titulo"><Ic.IconoLlave /> Tu acceso</h2>
          <p className="texto-tenue">
            {permisos.length ? `${permisos.length} permisos, según las casillas de tu rol en «Roles y permisos».` : 'Tu rol no tiene permisos marcados todavía.'}
          </p>
          <dl className="permisos">
            {Object.entries(porModulo).map(([modulo, nombres]) => (
              <div key={modulo}><dt>{modulo}</dt>{nombres.map((n) => <dd key={n}><Ic.IconoPalomita width={13} height={13} />{n}</dd>)}</div>
            ))}
          </dl>
        </section>
        <EstadoSistema />
      </div>
    </>
  );
}
