// 02c · Usuarios y roles › Roles y permisos
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { contar } from '../../formato.js';
import { AvisoExito, Encabezado, PestanasSeguridad } from '../../componentes/Pagina.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Entrada } from '../../componentes/Formulario.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import * as Ic from '../../componentes/Iconos.jsx';

const mismos = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const desde = (rol) => (rol ? { nombre: rol.nombre, descripcion: rol.descripcion ?? '', permisos: rol.permisos } : { nombre: '', descripcion: '', permisos: [] });

export default function Roles() {
  const { id: param } = useParams();
  const navegar = useNavigate();
  const { refrescar } = useSesion();
  const [datos, setDatos] = useState(null); // { roles, catalogo }
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [borrador, setBorrador] = useState(null);
  const [errores, setErrores] = useState({});
  const [errorAccion, setErrorAccion] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [dialogo, setDialogo] = useState(null);

  const cargar = useCallback(() => api.get('/roles').then(setDatos).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  const quitarAviso = useCallback(() => setAviso(null), []);

  const nuevo = param === 'nuevo';
  const rol = !datos || nuevo ? null : param ? datos.roles.find((r) => String(r.id) === param) : datos.roles[0];
  const sistema = datos?.roles.find((r) => r.es_sistema);
  const modulos = useMemo(() => (datos?.catalogo ?? []).reduce((m, p) => {
    (m[p.modulo] ??= []).push(p);
    return m;
  }, {}), [datos]);

  // Al elegir otro rol (o después de guardar), el formulario muestra lo guardado
  const restaurar = useCallback(() => {
    setBorrador(nuevo || rol ? desde(rol) : null);
    setErrores({});
    setErrorAccion(null);
  }, [nuevo, rol]);
  useEffect(() => { if (datos) restaurar(); }, [datos, restaurar]);

  const sucio = !!borrador && (nuevo
    ? !!(borrador.nombre.trim() || borrador.descripcion.trim() || borrador.permisos.length)
    : !!rol && (borrador.nombre !== rol.nombre || borrador.descripcion !== (rol.descripcion ?? '') || !mismos(borrador.permisos, rol.permisos)));

  // Cambiar de rol con casillas sin guardar pide confirmación
  const ir = (destino) => (sucio ? setDialogo({ tipo: 'descartar', destino }) : navegar(destino));

  const bloqueado = !nuevo && (!rol?.activo || rol?.es_sistema);
  const alternar = (clave) => setBorrador((b) => ({
    ...b, permisos: b.permisos.includes(clave) ? b.permisos.filter((p) => p !== clave) : [...b.permisos, clave],
  }));
  const campo = (nombre) => (e) => {
    setBorrador((b) => ({ ...b, [nombre]: e.target.value }));
    setErrores((x) => ({ ...x, [nombre]: undefined }));
  };

  async function enviar(accion) {
    setEnviando(true);
    setErrores({});
    setErrorAccion(null);
    try {
      const r = await accion();
      await cargar();
      refrescar(); // por si cambió el rol de quien está usando la pantalla
      return r;
    } catch (e) {
      setErrores(e.cuerpo?.campos ?? {});
      setErrorAccion(e.message);
      return null;
    } finally {
      setEnviando(false);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    if (nuevo) {
      const r = await enviar(() => api.post('/roles', borrador));
      if (r) {
        setAviso(`Se creó el rol ${r.nombre}. Ya lo puedes asignar en Usuarios.`);
        navegar(`/roles/${r.id}`, { replace: true });
      }
    } else {
      const r = await enviar(() => api.put(`/roles/${rol.id}`, borrador));
      if (r) setAviso(`Se guardaron los cambios del rol ${r.nombre}.`);
    }
  }

  async function darDeBaja() {
    setDialogo(null);
    const r = await enviar(() => api.post(`/roles/${rol.id}/dar-de-baja`));
    if (r) setAviso(`El rol ${r.nombre} quedó dado de baja: ya no se puede asignar.`);
  }
  async function reactivar() {
    const r = await enviar(() => api.post(`/roles/${rol.id}/reactivar`));
    if (r) setAviso(`El rol ${r.nombre} se reactivó.`);
  }

  return (
    <>
      <Encabezado titulo="Usuarios y roles" subtitulo="Define qué puede hacer cada tipo de empleado en el sistema">
        <button className="boton boton-primario compacto" onClick={() => ir('/roles/nuevo')} disabled={nuevo}>
          <Ic.IconoMas width={17} height={17} />Nuevo rol
        </button>
      </Encabezado>

      <div className="contenido">
        <PestanasSeguridad />
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />
        <Alerta>{error}</Alerta>
        {!datos && !error && <p className="texto-tenue">Cargando roles…</p>}

        {datos && (
          <div className="roles">
            <aside className="tarjeta lista-roles">
              <div className="lista-roles-encabezado"><h2>Roles</h2><span>{contar(datos.roles.length, 'rol', 'roles')}</span></div>
              <ul>
                {datos.roles.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => ir(`/roles/${r.id}`)} aria-current={r.id === rol?.id || undefined}
                      className={`${r.id === rol?.id ? 'elegido' : ''} ${r.activo ? '' : 'apagado'}`}>
                      <span className="lista-roles-nombre">{r.nombre}</span>
                      <span className="lista-roles-detalle">{r.usuarios_texto}</span>
                      {r.es_sistema && <span className="lista-roles-marca"><Ic.IconoCandado width={15} height={15} />Sistema</span>}
                      {!r.activo && <span className="lista-roles-marca">Dado de baja</span>}
                    </button>
                  </li>
                ))}
                {nuevo && (
                  <li>
                    <button type="button" className="elegido" aria-current>
                      <span className="lista-roles-nombre">{borrador?.nombre.trim() || 'Rol nuevo'}</span>
                      <span className="lista-roles-detalle">Sin guardar</span>
                    </button>
                  </li>
                )}
              </ul>
              {sistema && (
                <p className="lista-roles-nota">
                  <Ic.IconoInfo width={16} height={16} />
                  El rol {sistema.nombre} es del sistema: no se puede eliminar ni quitarle permisos, para que siempre haya alguien que administre.
                </p>
              )}
            </aside>

            {!borrador ? (
              <section className="tarjeta detalle-rol"><p className="texto-tenue">No existe ese rol. Elige uno de la lista.</p></section>
            ) : (
              <form className="tarjeta detalle-rol" onSubmit={guardar} noValidate>
                <div className="detalle-rol-encabezado">
                  <div>
                    <h2>{nuevo ? 'Nuevo rol' : `Rol: ${rol.nombre}`}</h2>
                    <p className="tarjeta-sub">{nuevo ? 'Ponle nombre y marca lo que podrán hacer las personas con este rol' : 'Marca lo que las personas con este rol pueden hacer'}</p>
                  </div>
                  {!nuevo && <span className="pastilla">{rol.usuarios_vigentes ? `${contar(rol.usuarios_vigentes, 'usuario')} con este rol` : 'Sin usuarios activos'}</span>}
                </div>

                {!nuevo && !rol.activo && (
                  <p className="nota-rol"><Ic.IconoInfo width={16} height={16} />Este rol está dado de baja: no se puede asignar a nadie. Reactívalo para editarlo.</p>
                )}

                <div className="rejilla-campos rol-campos">
                  <Entrada etiqueta="Nombre del rol" obligatorio value={borrador.nombre} onChange={campo('nombre')} error={errores.nombre}
                    disabled={bloqueado} maxLength={50} autoFocus={nuevo}
                    ayuda={rol?.es_sistema ? 'El nombre del rol del sistema no se cambia.' : undefined} />
                  <Entrada etiqueta="Descripción" value={borrador.descripcion} onChange={campo('descripcion')} error={errores.descripcion}
                    disabled={!nuevo && !rol.activo} maxLength={200} placeholder="Ej. Toma y da seguimiento a las comandas de sus mesas" />
                </div>

                <div className="permisos-encabezado">
                  <h3>Permisos</h3>
                  <span>{borrador.permisos.length} de {datos.catalogo.length} permisos activos</span>
                </div>
                {errores.permisos && <p className="campo-error">{errores.permisos}</p>}
                <div className="modulos">
                  {Object.entries(modulos).map(([modulo, permisos]) => {
                    const n = permisos.filter((p) => borrador.permisos.includes(p.clave)).length;
                    return (
                      <div key={modulo} className="modulo" role="group" aria-label={modulo}>
                        <div className="modulo-encabezado"><span>{modulo}</span><span className={n ? 'cuenta activa' : 'cuenta'}>{n} / {permisos.length}</span></div>
                        {permisos.map((p) => (
                          <label key={p.clave} className="casilla" title={p.descripcion ?? undefined}>
                            <input type="checkbox" checked={borrador.permisos.includes(p.clave)} disabled={bloqueado} onChange={() => alternar(p.clave)} />
                            <span>{p.nombre}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>

                <Alerta>{errorAccion}</Alerta>

                <div className="detalle-rol-pie">
                  <div>
                    <p>{rol?.es_sistema
                      ? `El rol ${rol.nombre} conserva siempre todos los permisos.`
                      : 'Los cambios aplican desde la siguiente acción de cada usuario, sin que tenga que volver a entrar.'}</p>
                    {rol?.activo && !rol.es_sistema && !rol.se_puede_dar_de_baja && (
                      <p className="texto-tenue">No se puede dar de baja este rol mientras tenga usuarios asignados.</p>
                    )}
                  </div>
                  <div className="botones">
                    {nuevo && (
                      <>
                        <button type="button" className="boton boton-secundario" onClick={() => ir('/roles')}>Cancelar</button>
                        <button type="submit" className="boton boton-primario compacto" disabled={enviando}>{enviando ? 'Creando…' : 'Crear rol'}</button>
                      </>
                    )}
                    {rol?.activo && (
                      <>
                        <button type="button" className="boton boton-peligro" disabled={enviando || !rol.se_puede_dar_de_baja}
                          onClick={() => setDialogo({ tipo: 'baja' })}>Dar de baja rol</button>
                        <button type="submit" className="boton boton-primario compacto" disabled={enviando || !sucio}>
                          {enviando ? 'Guardando…' : 'Guardar cambios'}
                        </button>
                      </>
                    )}
                    {rol && !rol.activo && (
                      <button type="button" className="boton boton-primario compacto" onClick={reactivar} disabled={enviando}>Reactivar rol</button>
                    )}
                  </div>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {dialogo?.tipo === 'descartar' && (
        <Dialogo titulo="¿Descartar los cambios?" alCerrar={() => setDialogo(null)}
          acciones={<>
            <button className="boton boton-secundario" onClick={() => setDialogo(null)} data-foco>Seguir editando</button>
            <button className="boton boton-peligro-lleno" onClick={() => { setDialogo(null); restaurar(); navegar(dialogo.destino); }}>Descartar</button>
          </>}>
          <p>Tienes cambios sin guardar en {nuevo ? 'el rol nuevo' : `el rol ${rol.nombre}`}.</p>
        </Dialogo>
      )}
      {dialogo?.tipo === 'baja' && (
        <Dialogo titulo={`¿Dar de baja el rol ${rol.nombre}?`} alCerrar={() => setDialogo(null)}
          acciones={<>
            <button className="boton boton-secundario" onClick={() => setDialogo(null)} data-foco>Cancelar</button>
            <button className="boton boton-peligro-lleno" onClick={darDeBaja}>Dar de baja rol</button>
          </>}>
          <p>Ningún usuario Activo o Pendiente lo tiene. Ya no aparecerá al dar de alta o editar usuarios; lo puedes reactivar después.</p>
        </Dialogo>
      )}
    </>
  );
}
