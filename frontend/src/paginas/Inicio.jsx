// Inicio provisional después de iniciar sesión.
// El menú lateral se arma con los PERMISOS del rol (no con el nombre del
// rol), porque en 02c el gerente puede crear roles y cambiar sus casillas.
// Las pantallas de cada módulo se agregan en las siguientes tareas.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSesion } from '../sesion/ContextoSesion.jsx';
import { Logo } from '../componentes/Campos.jsx';
import * as Ic from '../componentes/Iconos.jsx';

const MODULOS = [
  { nombre: 'Mesas', icono: Ic.IconoMesa, permisos: ['mesa.ver', 'mesa.administrar'] },
  { nombre: 'Reservaciones', icono: Ic.IconoCalendario, permisos: ['reservacion.gestionar'] },
  { nombre: 'Comandas', icono: Ic.IconoLista, permisos: ['comanda.abrir'] },
  { nombre: 'Cocina y barra', icono: Ic.IconoCocina, permisos: ['produccion.ver'] },
  { nombre: 'Cobro', icono: Ic.IconoRecibo, permisos: ['pago.registrar', 'ticket.pre_ticket'] },
  { nombre: 'Cortes de caja', icono: Ic.IconoCaja, permisos: ['caja.corte'] },
  { nombre: 'Menú y productos', icono: Ic.IconoMenu, permisos: ['menu.administrar', 'menu.asignar_86'] },
  { nombre: 'Reportes', icono: Ic.IconoGrafica, permisos: ['reporte.ver'] },
  { nombre: 'Usuarios y roles', icono: Ic.IconoPersonas, permisos: ['usuario.administrar', 'rol.administrar'] },
];

const hora = (f) => new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
function cuandoFue(f) {
  if (!f) return 'Nunca';
  const d = new Date(f);
  const dias = Math.floor((Date.now() - d) / 86_400_000);
  if (dias < 1) return `Hoy ${hora(d)}`;
  if (dias < 2) return `Ayer ${hora(d)}`;
  if (dias < 14) return `Hace ${dias} días`;
  return `Hace ${Math.round(dias / 7)} semanas`;
}

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

function Personal() {
  const [usuarios, setUsuarios] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get('/usuarios').then(setUsuarios).catch((e) => setError(e.message)); }, []);
  return (
    <section className="tarjeta ancho">
      <h2 className="tarjeta-titulo"><Ic.IconoPersonas /> Personal con acceso</h2>
      <p className="texto-tenue">Solo lo ve quien tiene el permiso «Administrar usuarios». La pantalla completa (02a) va en la siguiente tarea.</p>
      {error && <p className="texto-malo">{error}</p>}
      {usuarios && (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td><span className="avatar chico">{u.nombre_completo.split(/\s+/).slice(0, 2).map((p) => p[0]).join('')}</span>{u.nombre_completo}</td>
                  <td className="texto-gris">{u.nombre_usuario}</td>
                  <td>{u.rol}</td>
                  <td><span className={`insignia ${u.estado_tono}`}>{u.estado_etiqueta}</span></td>
                  <td className={u.en_linea ? 'texto-ok' : 'texto-gris'}>{u.en_linea ? 'En línea' : cuandoFue(u.ultimo_acceso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Inicio() {
  const { datos, cerrarSesion, tienePermiso } = useSesion();
  const navegar = useNavigate();
  const { usuario, permisos, sesion } = datos;
  const modulos = MODULOS.filter((m) => m.permisos.some(tienePermiso));
  const porModulo = permisos.reduce((acc, p) => ({ ...acc, [p.modulo]: [...(acc[p.modulo] || []), p.nombre] }), {});

  async function salir() {
    await cerrarSesion();
    navegar('/iniciar-sesion', { replace: true });
  }

  return (
    <div className="marco">
      <aside className="lateral">
        <div className="lateral-marca"><Logo tam={32} /><span>KitchenLink</span></div>
        <nav className="lateral-menu" aria-label="Módulos">
          <a className="activo" href="/" onClick={(e) => e.preventDefault()}><Ic.IconoInicio />Inicio</a>
          {modulos.map(({ nombre, icono: Icono }) => (
            <span key={nombre} className="deshabilitado" title="Se agrega en las siguientes tareas">
              <Icono />{nombre}<small>pronto</small>
            </span>
          ))}
        </nav>
        <div className="lateral-perfil">
          <span className="avatar">{usuario.iniciales}</span>
          <div className="lateral-perfil-texto">
            <strong>{usuario.rol}</strong>
            <small>Sesión activa</small>
          </div>
          <button className="boton-icono" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión"><Ic.IconoSalir /></button>
        </div>
      </aside>

      <div className="principal">
        <header className="encabezado">
          <div>
            <h1>Hola, {usuario.nombre_completo.split(' ')[0]}</h1>
            <p>{usuario.rol} · sesión iniciada a las {hora(sesion.emitida_en)} · vence a las {hora(sesion.expira_en)}</p>
          </div>
          <button className="boton boton-secundario" onClick={salir}><Ic.IconoSalir width={16} height={16} />Cerrar sesión</button>
        </header>

        <div className="contenido">
          <section className="tarjeta">
            <h2 className="tarjeta-titulo"><Ic.IconoLlave /> Tu acceso</h2>
            <p className="texto-tenue">{permisos.length} de 17 permisos, según las casillas de tu rol en «Roles y permisos».</p>
            <dl className="permisos">
              {Object.entries(porModulo).map(([modulo, nombres]) => (
                <div key={modulo}><dt>{modulo}</dt>{nombres.map((n) => <dd key={n}><Ic.IconoPalomita width={13} height={13} />{n}</dd>)}</div>
              ))}
            </dl>
          </section>
          <EstadoSistema />
          {tienePermiso('usuario.administrar') && <Personal />}
        </div>
      </div>
    </div>
  );
}
