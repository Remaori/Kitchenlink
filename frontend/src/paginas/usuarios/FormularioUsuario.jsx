// 02b · Nuevo usuario  ·  y "Editar" desde 02a (misma pantalla, sin contraseña temporal)
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { cuandoFue, iniciales } from '../../formato.js';
import { Encabezado } from '../../componentes/Pagina.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { ContrasenaTemporal, Entrada, Selector } from '../../componentes/Formulario.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import { DialogoRestablecer } from './Usuarios.jsx';
import * as Ic from '../../componentes/Iconos.jsx';

const VACIO = { nombre_completo: '', telefono: '', correo: '', nombre_usuario: '', rol_id: '' };

// "Sofía Méndez Ortega" -> "smendez" (inicial del nombre + primer apellido, sin acentos)
function sugerirUsuario(nombre) {
  const p = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  return (p.length === 1 ? p[0] : p[0][0] + p[1]).slice(0, 40);
}

export default function FormularioUsuario() {
  const { id } = useParams();
  const nuevo = !id;
  const navegar = useNavigate();
  const { datos: sesion, tienePermiso } = useSesion();
  const soyYo = !nuevo && Number(id) === sesion.usuario.id;

  const [form, setForm] = useState(VACIO);
  const [usuarioTocado, setUsuarioTocado] = useState(false);
  const [temporal, setTemporal] = useState('');
  const [original, setOriginal] = useState(null); // edición: el usuario como está guardado
  const [roles, setRoles] = useState(null);
  const [catalogo, setCatalogo] = useState([]);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [dialogo, setDialogo] = useState(null);

  const generar = () => api.get('/usuarios/contrasena-temporal').then((r) => setTemporal(r.temporal)).catch((e) => setError(e.message));

  useEffect(() => {
    api.get('/roles').then((r) => { setRoles(r.roles); setCatalogo(r.catalogo); }).catch((e) => setError(e.message));
    if (nuevo) generar();
    else {
      api.get(`/usuarios/${id}`).then((u) => {
        setOriginal(u);
        setForm({ nombre_completo: u.nombre_completo, telefono: u.telefono ?? '', correo: u.correo ?? '', nombre_usuario: u.nombre_usuario, rol_id: String(u.rol_id) });
      }).catch((e) => setError(e.message));
    }
  }, [id]);

  // Mientras no escriba el usuario a mano, se sugiere a partir del nombre
  const cambiar = (campo) => (e) => {
    const valor = e.target.value;
    setForm((f) => {
      const s = { ...f, [campo]: valor };
      if (nuevo && campo === 'nombre_completo' && !usuarioTocado) s.nombre_usuario = sugerirUsuario(valor);
      return s;
    });
    if (campo === 'nombre_usuario') setUsuarioTocado(true);
    setErrores((x) => ({ ...x, [campo]: undefined }));
  };

  const rolElegido = roles?.find((r) => String(r.id) === form.rol_id);
  const opciones = (roles ?? []).filter((r) => r.activo || String(r.id) === form.rol_id);

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    setErrores({});
    setEnviando(true);
    try {
      const cuerpo = { ...form, rol_id: form.rol_id ? Number(form.rol_id) : null };
      if (nuevo) {
        const u = await api.post('/usuarios', { ...cuerpo, contrasena_temporal: temporal });
        navegar('/usuarios', { state: { resaltar: u.id, aviso: `Se creó a ${u.nombre_completo} como Pendiente. Entrégale su usuario «${u.nombre_usuario}» y la contraseña temporal.` } });
      } else {
        const u = await api.put(`/usuarios/${id}`, cuerpo);
        navegar('/usuarios', { state: { resaltar: u.id, aviso: `Se guardaron los cambios de ${u.nombre_completo}.` } });
      }
    } catch (err) {
      setErrores(err.cuerpo?.campos ?? {});
      setError(err.cuerpo?.campos ? 'Revisa los datos marcados.' : err.message);
      setEnviando(false);
    }
  }

  const titulo = nuevo ? 'Nuevo usuario' : 'Editar usuario';
  const cargando = !roles || (!nuevo && !original);
  const estado = nuevo ? { etiqueta: 'Pendiente', tono: 'warn' } : original && { etiqueta: original.estado_etiqueta, tono: original.estado_tono };

  return (
    <form onSubmit={guardar} noValidate>
      <Encabezado titulo={titulo} migas={[['Usuarios y roles', '/usuarios'], [nuevo ? 'Nuevo usuario' : (original?.nombre_completo ?? '…')]]}>
        <Link className="boton boton-secundario" to="/usuarios">Cancelar</Link>
        <button type="submit" className="boton boton-primario compacto" disabled={enviando || cargando || (original?.estado === 'dado_de_baja')}>
          {nuevo ? <><Ic.IconoMas width={17} height={17} />{enviando ? 'Creando…' : 'Crear usuario'}</> : (enviando ? 'Guardando…' : 'Guardar cambios')}
        </button>
      </Encabezado>

      <div className="contenido">
        <Alerta>{error}</Alerta>
        {cargando && !error && <p className="texto-tenue">Cargando…</p>}
        {!cargando && (
          <div className="dos-columnas">
            <div className="columna">
              <section className="tarjeta formulario">
                <h2>Datos del empleado</h2>
                <p className="tarjeta-sub">Información de contacto de la persona</p>
                <div className="rejilla-campos">
                  <Entrada etiqueta="Nombre completo" obligatorio value={form.nombre_completo} onChange={cambiar('nombre_completo')}
                    error={errores.nombre_completo} maxLength={120} autoFocus={nuevo} autoComplete="off" />
                  <Entrada etiqueta="Teléfono" value={form.telefono} onChange={cambiar('telefono')} error={errores.telefono}
                    icono={<Ic.IconoTelefono width={17} height={17} />} inputMode="tel" maxLength={20} autoComplete="off" />
                  <div className="ancho-completo">
                    <Entrada etiqueta="Correo electrónico (opcional)" type="email" placeholder="Ej. sofia@correo.com" value={form.correo}
                      onChange={cambiar('correo')} error={errores.correo} maxLength={120} autoComplete="off" />
                  </div>
                </div>
              </section>

              <section className="tarjeta formulario">
                <h2>Acceso al sistema</h2>
                <p className="tarjeta-sub">Con estos datos iniciará sesión</p>
                <div className="rejilla-campos">
                  <Entrada etiqueta="Nombre de usuario" obligatorio value={form.nombre_usuario} onChange={cambiar('nombre_usuario')}
                    error={errores.nombre_usuario} disabled={!nuevo} maxLength={40} autoCapitalize="none" spellCheck={false} autoComplete="off"
                    ayuda={nuevo ? 'Es único: no puede repetirse con otro usuario.' : 'No se cambia: es con lo que inicia sesión.'} />
                  <Selector etiqueta="Rol" obligatorio value={form.rol_id} onChange={cambiar('rol_id')} error={errores.rol_id} disabled={soyYo}
                    ayuda={soyYo ? 'No puedes cambiar tu propio rol.' : 'Define qué pantallas y acciones tendrá disponibles.'}>
                    <option value="" disabled>Elige un rol</option>
                    {opciones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </Selector>
                </div>

                {nuevo ? (
                  <>
                    <div className="campo-form">
                      <span className="etiqueta">Contraseña temporal<span className="obligatorio" aria-hidden="true">*</span></span>
                      <ContrasenaTemporal valor={temporal} alGenerar={generar} error={errores.contrasena_temporal} />
                      {errores.contrasena_temporal
                        ? <p className="campo-error">{errores.contrasena_temporal}</p>
                        : <p className="campo-ayuda">Entrégasela al empleado. Por seguridad, solo se muestra en este momento.</p>}
                    </div>
                    <label className="casilla-fija">
                      <input type="checkbox" checked disabled readOnly />
                      <span>
                        <strong>Pedir que cree su propia contraseña en el primer inicio de sesión</strong>
                        <small>Siempre activo en usuarios nuevos y en contraseñas restablecidas: no se puede desmarcar.</small>
                      </span>
                    </label>
                  </>
                ) : (
                  <div className="fila-contrasena">
                    <div>
                      <span className="etiqueta">Contraseña</span>
                      <p className="campo-ayuda sin-margen">
                        {original.requiere_cambio_pw ? 'Tiene una contraseña temporal: la cambia al entrar.' : 'Usa su propia contraseña. Nadie más la conoce.'}
                      </p>
                    </div>
                    <button type="button" className="boton boton-secundario" disabled={soyYo || original.estado === 'dado_de_baja'}
                      title={soyYo ? 'No puedes restablecer tu propia contraseña: pídeselo a otro gerente.' : undefined}
                      onClick={() => setDialogo('restablecer')}>
                      <Ic.IconoLlave width={16} height={16} />Restablecer contraseña
                    </button>
                  </div>
                )}
              </section>
            </div>

            <div className="columna">
              <section className="tarjeta">
                <h2>Así aparecerá en la lista</h2>
                <p className="tarjeta-sub">Se actualiza mientras llenas el formulario</p>
                <div className="vista-previa">
                  <span className={`avatar ${estado?.tono === 'warn' ? 'ambar' : ''}`}>{iniciales(form.nombre_completo) || '?'}</span>
                  <div>
                    <div className="ficha-nombre">{form.nombre_completo.trim() || 'Nombre completo'}</div>
                    <div className="ficha-detalle">{form.nombre_usuario || 'usuario'} · {rolElegido?.nombre ?? 'Rol'}</div>
                  </div>
                  {estado && <span className={`insignia ${estado.tono}`}>{estado.etiqueta}</span>}
                </div>
              </section>

              <PermisosDelRol rol={rolElegido} catalogo={catalogo} puedeEditar={tienePermiso('rol.administrar')} />

              {nuevo ? (
                <section className="tarjeta">
                  <h2>¿Qué pasa después?</h2>
                  <ol className="pasos">
                    <li>Entrégale al empleado su nombre de usuario y la contraseña temporal.</li>
                    <li>En su primer inicio de sesión, el sistema le pedirá crear su propia contraseña.</li>
                    <li>Al hacerlo, su estado cambia de Pendiente a Activo automáticamente.</li>
                  </ol>
                </section>
              ) : (
                <section className="tarjeta">
                  <h2>Estado de la cuenta</h2>
                  <dl className="datos">
                    <dt>Estado</dt><dd><span className={`insignia ${original.estado_tono}`}>{original.estado_etiqueta}</span></dd>
                    <dt>Último acceso</dt><dd>{original.en_linea ? <span className="en-linea">En línea</span> : cuandoFue(original.ultimo_acceso)}</dd>
                  </dl>
                  <hr className="separador" />
                  <p className="texto-tenue">Dar de baja no borra: sus comandas y cobros se conservan, y lo puedes reactivar después.</p>
                  <button type="button" className="boton boton-peligro" disabled={soyYo} onClick={() => setDialogo('baja')}
                    title={soyYo ? 'No puedes darte de baja a ti mismo.' : undefined}>
                    Dar de baja
                  </button>
                </section>
              )}
            </div>
          </div>
        )}
      </div>

      {dialogo === 'restablecer' && (
        <DialogoRestablecer usuario={original} alCerrar={() => setDialogo(null)}
          alTerminar={() => api.get(`/usuarios/${id}`).then(setOriginal)} />
      )}
      {dialogo === 'baja' && <DialogoBaja usuario={original} alCerrar={() => setDialogo(null)} />}
    </form>
  );
}

/** "Lo que podrá hacer como …": casillas del rol elegido, agrupadas por módulo */
function PermisosDelRol({ rol, catalogo, puedeEditar }) {
  const modulos = useMemo(() => catalogo.reduce((m, p) => {
    (m[p.modulo] ??= []).push(p);
    return m;
  }, {}), [catalogo]);
  if (!rol) {
    return (
      <section className="tarjeta">
        <h2>Lo que podrá hacer</h2>
        <p className="tarjeta-sub">Elige un rol para ver los permisos que otorga.</p>
      </section>
    );
  }
  const tiene = new Set(rol.permisos);
  return (
    <section className="tarjeta">
      <h2>Lo que podrá hacer como {rol.nombre}</h2>
      <p className="tarjeta-sub">Permisos que otorga el rol seleccionado · {rol.permisos_texto}</p>
      <ul className="lista-permisos">
        {Object.entries(modulos).map(([modulo, permisos]) => {
          const si = permisos.filter((p) => tiene.has(p.clave));
          if (!si.length) return <li key={modulo} className="no"><Ic.IconoEquis width={13} height={13} />Sin acceso a {modulo}</li>;
          return si.map((p) => <li key={p.clave}><Ic.IconoPalomita width={13} height={13} />{p.nombre}</li>);
        })}
      </ul>
      {puedeEditar && <Link className="enlace con-flecha" to={`/roles/${rol.id}`}>Editar permisos del rol<Ic.IconoFlecha width={16} height={16} /></Link>}
    </section>
  );
}

function DialogoBaja({ usuario, alCerrar }) {
  const navegar = useNavigate();
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  async function darDeBaja() {
    setEnviando(true);
    try {
      const u = await api.post(`/usuarios/${usuario.id}/dar-de-baja`);
      navegar('/usuarios', { state: { resaltar: u.id, aviso: `${u.nombre_completo} quedó dado de baja. Sus sesiones abiertas se cerraron.` } });
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }
  return (
    <Dialogo titulo={`¿Dar de baja a ${usuario.nombre_completo}?`} alCerrar={alCerrar}
      acciones={<>
        <button type="button" className="boton boton-secundario" onClick={alCerrar} data-foco>Cancelar</button>
        <button type="button" className="boton boton-peligro-lleno" onClick={darDeBaja} disabled={enviando}>{enviando ? 'Dando de baja…' : 'Dar de baja'}</button>
      </>}>
      <ul className="lista-puntos">
        <li>Ya no podrá iniciar sesión, y si está en línea su sesión se cierra en este momento.</li>
        <li>Sus comandas, cobros e historial se conservan.</li>
        <li>Lo puedes reactivar después desde la lista de usuarios.</li>
      </ul>
      <Alerta>{error}</Alerta>
    </Dialogo>
  );
}
