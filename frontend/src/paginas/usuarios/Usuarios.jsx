// 02a · Usuarios y roles › Usuarios
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { contar, cuandoFue, fechaHora, iniciales } from '../../formato.js';
import { AvisoExito, Encabezado, PestanasSeguridad } from '../../componentes/Pagina.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { ContrasenaTemporal } from '../../componentes/Formulario.jsx';
import * as Ic from '../../componentes/Iconos.jsx';

const ESTADOS = [['activo', 'Activo'], ['pendiente', 'Pendiente'], ['dado_de_baja', 'Dado de baja']];
const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function resumen(usuarios) {
  const n = (e) => usuarios.filter((u) => u.estado === e).length;
  return [
    contar(usuarios.length, 'usuario'),
    contar(n('activo'), 'activo'),
    contar(n('pendiente'), 'pendiente'),
    `${n('dado_de_baja')} ${n('dado_de_baja') === 1 ? 'dado' : 'dados'} de baja`,
  ].join(' · ');
}

export default function Usuarios() {
  const { datos } = useSesion();
  const yo = datos.usuario.id;
  const navegar = useNavigate();
  const { state } = useLocation();
  const [usuarios, setUsuarios] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [rol, setRol] = useState('');
  const [estado, setEstado] = useState('');
  const [dialogo, setDialogo] = useState(null); // { tipo, usuario, … }
  const [aviso, setAviso] = useState(state?.aviso ?? null);
  const resaltar = state?.resaltar;

  const cargar = useCallback(() => api.get('/usuarios').then(setUsuarios).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  // El aviso de "se creó…" viene en el state de la navegación: se limpia para que no reaparezca al recargar
  useEffect(() => { if (state?.aviso) navegar('.', { replace: true, state: { resaltar } }); }, [state, resaltar, navegar]);
  const quitarAviso = useCallback(() => setAviso(null), []);

  const roles = useMemo(() => [...new Set((usuarios ?? []).map((u) => u.rol))], [usuarios]);
  const visibles = useMemo(() => (usuarios ?? []).filter((u) => {
    const q = sinAcentos(busqueda.trim());
    return (!q || sinAcentos(`${u.nombre_completo} ${u.nombre_usuario}`).includes(q))
      && (!rol || u.rol === rol) && (!estado || u.estado === estado);
  }), [usuarios, busqueda, rol, estado]);

  const listo = (texto) => { setDialogo(null); setAviso(texto); cargar(); };

  return (
    <>
      <Encabezado titulo="Usuarios y roles" subtitulo="Administra el personal que tiene acceso al sistema">
        <Link className="boton boton-primario compacto" to="/usuarios/nuevo"><Ic.IconoMas width={17} height={17} />Nuevo usuario</Link>
      </Encabezado>

      <div className="contenido">
        <PestanasSeguridad />
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />

        <div className="filtros">
          <div className="entrada con-icono-izq buscador">
            <Ic.IconoBuscar className="entrada-icono-izq" />
            <input type="search" placeholder="Buscar por nombre o usuario..." value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar por nombre o usuario" />
          </div>
          <select className="selector" value={rol} onChange={(e) => setRol(e.target.value)} aria-label="Filtrar por rol">
            <option value="">Todos los roles</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="selector" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {ESTADOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          {usuarios && <p className="filtros-resumen">{resumen(usuarios)}</p>}
        </div>

        {error && <Alerta>{error}</Alerta>}
        {!usuarios && !error && <p className="texto-tenue">Cargando usuarios…</p>}
        {usuarios && (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado de la cuenta</th><th>Último acceso</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {visibles.map((u) => {
                  const baja = u.estado === 'dado_de_baja';
                  return (
                    <tr key={u.id} className={`${baja ? 'apagada' : ''} ${u.id === resaltar ? 'resaltada' : ''}`}>
                      <td>
                        <span className={`avatar ${u.estado === 'pendiente' ? 'ambar' : baja ? 'gris' : ''}`}>{iniciales(u.nombre_completo)}</span>
                        <span className="celda-nombre">{u.nombre_completo}</span>
                        {u.estado === 'pendiente' && <span className="etiqueta-nuevo">Nuevo</span>}
                      </td>
                      <td className="texto-gris">{u.nombre_usuario}</td>
                      <td>{u.rol}</td>
                      <td><span className={`insignia ${u.estado_tono}`}>{u.estado_etiqueta}</span></td>
                      <td>{u.en_linea ? <span className="en-linea">En línea</span> : <span className="texto-gris">{cuandoFue(u.ultimo_acceso)}</span>}</td>
                      <td><div className="acciones">
                        {baja ? (
                          <>
                            <button className="enlace" onClick={() => setDialogo({ tipo: 'reactivar', usuario: u })}>Reactivar</button>
                            <button className="enlace gris" onClick={() => setDialogo({ tipo: 'historial', usuario: u })}>Ver historial</button>
                          </>
                        ) : (
                          <>
                            <Link className="enlace" to={`/usuarios/${u.id}`}>Editar</Link>
                            <button className="enlace gris" disabled={u.id === yo}
                              title={u.id === yo ? 'No puedes restablecer tu propia contraseña: pídeselo a otro gerente.' : undefined}
                              onClick={() => setDialogo({ tipo: 'restablecer', usuario: u })}>Restablecer contraseña</button>
                          </>
                        )}
                      </div></td>
                    </tr>
                  );
                })}
                {!visibles.length && (
                  <tr><td colSpan={6} className="tabla-vacia">Ningún usuario coincide con la búsqueda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <section className="leyenda">
          <h2><Ic.IconoInfo width={17} height={17} />Estado de la cuenta y último acceso son cosas distintas</h2>
          <p>
            <span className="insignia ok">Activo</span><span>Puede iniciar sesión</span>
            <span className="insignia warn">Pendiente</span><span>Se creó, pero aún no entra por primera vez</span>
            <span className="insignia gray">Dado de baja</span><span>Ya no puede entrar; su historial se conserva</span>
          </p>
          <p><span className="en-linea">En línea</span><span>solo indica que tiene una sesión abierta ahora mismo</span></p>
        </section>
      </div>

      {dialogo?.tipo === 'restablecer' && <DialogoRestablecer usuario={dialogo.usuario} alCerrar={() => setDialogo(null)} alTerminar={cargar} />}
      {dialogo?.tipo === 'reactivar' && <DialogoReactivar usuario={dialogo.usuario} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
      {dialogo?.tipo === 'historial' && <DialogoHistorial usuario={dialogo.usuario} alCerrar={() => setDialogo(null)} />}
    </>
  );
}

/** "Restablecer contraseña": confirma y luego muestra la temporal una sola vez */
export function DialogoRestablecer({ usuario, alCerrar, alTerminar }) {
  const [temporal, setTemporal] = useState(null);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const nombre = usuario.nombre_completo.split(' ')[0];

  async function restablecer() {
    setEnviando(true);
    setError(null);
    try {
      const r = await api.post(`/usuarios/${usuario.id}/restablecer-contrasena`);
      setTemporal(r.temporal);
      alTerminar?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (temporal) {
    return (
      <Dialogo titulo="Contraseña restablecida" alCerrar={alCerrar}
        acciones={<button className="boton boton-primario compacto" onClick={alCerrar} data-foco>Listo</button>}>
        <p>Entrégale a <strong>{usuario.nombre_completo}</strong> su usuario <strong>{usuario.nombre_usuario}</strong> y esta contraseña temporal.
          Por seguridad, <strong>solo se muestra en este momento</strong>.</p>
        <ContrasenaTemporal valor={temporal} />
        <p className="texto-tenue sin-margen">Sus sesiones abiertas se cerraron. Al entrar, el sistema le pedirá crear su propia contraseña.</p>
      </Dialogo>
    );
  }
  return (
    <Dialogo titulo={`¿Restablecer la contraseña de ${usuario.nombre_completo}?`} alCerrar={alCerrar}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button className="boton boton-primario compacto" onClick={restablecer} disabled={enviando} data-foco>
          {enviando ? 'Restableciendo…' : 'Restablecer contraseña'}
        </button>
      </>}>
      <ul className="lista-puntos">
        <li>Se genera una contraseña temporal que le entregas a {nombre}.</li>
        <li>Sus sesiones abiertas se cierran en este momento.</li>
        <li>Al entrar con la temporal, tendrá que crear una propia antes de continuar.</li>
      </ul>
      <Alerta>{error}</Alerta>
    </Dialogo>
  );
}

function DialogoReactivar({ usuario, alCerrar, alTerminar }) {
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const nuncaEntro = !usuario.ultimo_acceso;
  async function reactivar() {
    setEnviando(true);
    try {
      const u = await api.post(`/usuarios/${usuario.id}/reactivar`);
      alTerminar(`${u.nombre_completo} se reactivó: queda ${u.estado_etiqueta}.`);
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }
  return (
    <Dialogo titulo={`¿Reactivar a ${usuario.nombre_completo}?`} alCerrar={alCerrar}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button className="boton boton-primario compacto" onClick={reactivar} disabled={enviando} data-foco>
          {enviando ? 'Reactivando…' : 'Reactivar'}
        </button>
      </>}>
      <p>{nuncaEntro
        ? 'Nunca inició sesión, así que vuelve a quedar Pendiente con la contraseña temporal que tenía. Si la perdió, restablécela después.'
        : `Vuelve a quedar Activo como ${usuario.rol} y puede entrar con su contraseña de siempre.`}</p>
      <Alerta>{error}</Alerta>
    </Dialogo>
  );
}

function DialogoHistorial({ usuario, alCerrar }) {
  const [h, setH] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get(`/usuarios/${usuario.id}/historial`).then(setH).catch((e) => setError(e.message)); }, [usuario.id]);
  return (
    <Dialogo titulo={`Historial de ${usuario.nombre_completo}`} alCerrar={alCerrar} ancho={620}>
      <Alerta>{error}</Alerta>
      {!h && !error && <p className="texto-tenue">Cargando…</p>}
      {h && (
        <>
          <p className="texto-tenue sin-margen">
            {h.usuario.nombre_usuario} · {h.usuario.rol} · {h.usuario.estado_etiqueta}
            {h.usuario.dado_de_baja_en && ` desde el ${fechaHora(h.usuario.dado_de_baja_en)}`}
          </p>
          <div className="conservado">
            <div><strong>{h.conservado.comandas}</strong><span>comandas atendidas</span></div>
            <div><strong>{h.conservado.pagos}</strong><span>cobros registrados</span></div>
            <div><strong>{h.conservado.sesiones}</strong><span>inicios de sesión</span></div>
          </div>
          <p className="texto-tenue">Dar de baja no borra: todo esto se conserva.</p>
          <ol className="linea-tiempo">
            {h.eventos.map((e) => (
              <li key={e.id}>
                <span className="linea-tiempo-fecha">{fechaHora(e.fecha)}</span>
                <span>{e.texto}{e.hecho_por && <span className="texto-gris"> · por {e.hecho_por}</span>}</span>
              </li>
            ))}
            {!h.eventos.length && <li><span>Sin movimientos registrados.</span></li>}
          </ol>
        </>
      )}
    </Dialogo>
  );
}
