// 09 · Menú y productos (gerente). La misma pantalla es el "Menú" del mesero
// (solo consulta) y "Productos 86" de cocina (solo asigna o quita el 86).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { contar, dinero, sinAcentos } from '../../formato.js';
import { AvisoExito, Encabezado } from '../../componentes/Pagina.jsx';
import { Buscador, Cargando, Explicacion, Insignia, Pestanas, Segmentos } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Entrada, Selector } from '../../componentes/Formulario.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { useAccion, useFormulario } from '../../usos.js';

const DESTINOS = [['cocina', 'Cocina'], ['barra', 'Barra']];
export const InsigniaDestino = ({ destino }) => (
  <Insignia tono={destino === 'barra' ? 'info' : 'gray'}>{destino === 'barra' ? 'Barra' : 'Cocina'}</Insignia>
);

export default function Menu() {
  const { tienePermiso } = useSesion();
  const administra = tienePermiso('menu.administrar');
  const asigna86 = tienePermiso('menu.asignar_86');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [pestana, setPestana] = useState('productos');
  const [elegida, setElegida] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [dialogo, setDialogo] = useState(null);

  const cargar = useCallback(() => api.get('/menu').then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  const quitarAviso = useCallback(() => setAviso(null), []);

  const categorias = datos?.categorias ?? [];
  const categoria = categorias.find((k) => k.id === elegida) ?? categorias.find((k) => k.activo) ?? categorias[0];
  const q = sinAcentos(busqueda.trim());
  const productos = useMemo(() => (datos?.productos ?? []).filter((p) => (q
    ? sinAcentos(`${p.nombre} ${p.descripcion ?? ''}`).includes(q)
    : p.categoria_id === categoria?.id)), [datos, q, categoria]);

  const listo = (texto) => { setDialogo(null); setAviso(texto); cargar(); };
  const titulo = administra ? 'Menú y productos' : asigna86 ? 'Productos 86' : 'Menú';
  const subtitulo = administra ? 'Catálogo del restaurante y sus categorías'
    : asigna86 ? 'Marca lo que se agotó: el mesero ya no lo puede capturar' : 'Lo que se puede ofrecer hoy; lo que tiene 86 está agotado';

  return (
    <>
      <Encabezado titulo={titulo} subtitulo={subtitulo}>
        {administra && (
          <>
            <button className="boton boton-secundario" onClick={() => setDialogo({ tipo: 'categoria' })}>
              <Ic.IconoMenu width={17} height={17} />Nueva categoría
            </button>
            <button className="boton boton-primario compacto" onClick={() => setDialogo({ tipo: 'producto', categoriaId: categoria?.activo ? categoria.id : undefined })}>
              <Ic.IconoMas width={17} height={17} />Nuevo producto
            </button>
          </>
        )}
      </Encabezado>

      <div className="contenido">
        {administra && <Pestanas valor={pestana} alCambiar={setPestana} opciones={[['productos', 'Productos'], ['categorias', 'Categorías']]} />}
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />
        <Alerta>{error}</Alerta>
        {!datos && !error && <Cargando texto="Cargando el menú…" />}

        {datos && pestana === 'productos' && (
          <>
            <div className="menu-rejilla">
              <aside className="tarjeta lista-lateral">
                <div className="lista-lateral-encabezado"><h2>Categorías</h2><span>{categorias.length}</span></div>
                <ul>
                  {categorias.map((k) => (
                    <li key={k.id}>
                      <button type="button" className={`${k.id === categoria?.id && !q ? 'elegido' : ''} ${k.activo ? '' : 'apagado'}`}
                        aria-current={(k.id === categoria?.id && !q) || undefined} onClick={() => { setElegida(k.id); setBusqueda(''); }}>
                        <span className="lista-lateral-nombre">{k.nombre}</span>
                        <span className="lista-lateral-detalle">{k.activo ? contar(k.productos, 'producto') : 'Dada de baja'}</span>
                        <span className="lista-lateral-marca"><InsigniaDestino destino={k.destino} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
                {administra && (
                  <button type="button" className="lista-lateral-agregar" onClick={() => setDialogo({ tipo: 'categoria' })}>
                    <Ic.IconoMas width={17} height={17} />Agregar categoría
                  </button>
                )}
              </aside>

              <section className="menu-productos">
                <div className="filtros">
                  <Buscador valor={busqueda} alCambiar={setBusqueda} texto="Buscar producto…" />
                  <p className="filtros-resumen">
                    {q ? `${contar(productos.length, 'producto')} encontrados en todo el menú`
                      : categoria && `${categoria.nombre} · ${contar(categoria.productos, 'producto')} · se preparan en ${categoria.destino === 'barra' ? 'barra' : 'cocina'}`}
                  </p>
                </div>
                <div className="tabla-envoltura">
                  <table className="tabla">
                    <thead>
                      <tr><th>Producto</th><th>Precio</th><th>Estado</th>{(administra || asigna86) && <th>Acciones</th>}</tr>
                    </thead>
                    <tbody>
                      {productos.map((p) => (
                        <tr key={p.id} className={p.activo ? '' : 'apagada'}>
                          <td className="celda-doble">
                            <strong>{p.nombre}</strong>
                            <small>{[q && p.categoria, p.descripcion].filter(Boolean).join(' · ') || ' '}</small>
                          </td>
                          <td>{dinero(p.precio)}</td>
                          <td>
                            {!p.activo ? <Insignia tono="gray">Fuera del menú</Insignia>
                              : p.disponible ? <Insignia tono="ok">Disponible</Insignia>
                                : <span title={p.motivo_no_disponible ?? undefined}><Insignia tono="bad">Asignado 86</Insignia></span>}
                            {p.activo && !p.disponible && p.motivo_no_disponible && <small className="motivo">{p.motivo_no_disponible}</small>}
                          </td>
                          {(administra || asigna86) && (
                            <td><div className="acciones">
                              {administra && p.activo && <button className="enlace" onClick={() => setDialogo({ tipo: 'producto', producto: p })}>Editar</button>}
                              {asigna86 && p.activo && (p.disponible
                                ? <button className="enlace gris" onClick={() => setDialogo({ tipo: '86', producto: p })}>Asignar 86</button>
                                : <QuitarOchentaYSeis producto={p} alTerminar={listo} />)}
                              {administra && !p.activo && <Regresar producto={p} alTerminar={listo} />}
                            </div></td>
                          )}
                        </tr>
                      ))}
                      {!productos.length && (
                        <tr><td colSpan={4} className="tabla-vacia">{q ? 'Ningún producto coincide con la búsqueda.' : 'Esta categoría todavía no tiene productos.'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {categoria && !q && (
              <section className="tarjeta categoria-resumen">
                <h2>Categoría: {categoria.nombre}</h2>
                <p className="tarjeta-sub">{administra ? 'Se edita desde la pestaña Categorías' : 'La define el gerente en Menú y productos'}</p>
                <div className="categoria-campos">
                  <Entrada etiqueta="Nombre" value={categoria.nombre} disabled readOnly />
                  <div className="campo-form">
                    <span className="etiqueta">Se prepara en</span>
                    <Segmentos opciones={DESTINOS} valor={categoria.destino} alCambiar={() => {}} etiqueta="Se prepara en" />
                  </div>
                  <Entrada etiqueta="Orden en el menú" value={categoria.orden} disabled readOnly />
                </div>
                <div className="dos-explicaciones">
                  <Explicacion tono="morado">Cocina o barra lo decide la categoría: Bebidas y Bar van al panel de barra; las demás, al de cocina. Por eso el producto no tiene su propio destino.</Explicacion>
                  <Explicacion icono={Ic.IconoNota}>Término de la carne, guarnición y peticiones especiales se escriben en la nota del producto al tomar la orden (05b). Si algo extra tiene costo, se da de alta como producto.</Explicacion>
                </div>
              </section>
            )}
          </>
        )}

        {datos && pestana === 'categorias' && (
          <Categorias categorias={categorias} alEditar={(k) => setDialogo({ tipo: 'categoria', categoria: k })} alTerminar={listo} />
        )}
      </div>

      {dialogo?.tipo === 'producto' && (
        <DialogoProducto producto={dialogo.producto} categoriaId={dialogo.categoriaId} categorias={categorias.filter((k) => k.activo)}
          alCerrar={() => setDialogo(null)} alTerminar={listo} />
      )}
      {dialogo?.tipo === 'categoria' && <DialogoCategoria categoria={dialogo.categoria} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
      {dialogo?.tipo === '86' && <DialogoOchentaYSeis producto={dialogo.producto} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
    </>
  );
}

function QuitarOchentaYSeis({ producto, alTerminar }) {
  const { error, enviando, hacer } = useAccion(alTerminar);
  return (
    <>
      <button className="enlace gris" disabled={enviando}
        onClick={() => hacer(() => api.post(`/menu/productos/${producto.id}/quitar-86`), `${producto.nombre} vuelve a estar disponible.`)}>Quitar 86</button>
      {error && <span className="texto-malo">{error}</span>}
    </>
  );
}

function Regresar({ producto, alTerminar }) {
  const { error, enviando, hacer } = useAccion(alTerminar);
  return (
    <>
      <button className="enlace" disabled={enviando}
        onClick={() => hacer(() => api.post(`/menu/productos/${producto.id}/reactivar`), `${producto.nombre} regresó al menú.`)}>Regresar al menú</button>
      {error && <span className="texto-malo">{error}</span>}
    </>
  );
}

function Categorias({ categorias, alEditar, alTerminar }) {
  const { error, enviando, hacer } = useAccion(alTerminar);
  return (
    <>
      <Alerta>{error}</Alerta>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead><tr><th>Orden</th><th>Categoría</th><th>Se prepara en</th><th>Productos</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {categorias.map((k) => (
              <tr key={k.id} className={k.activo ? '' : 'apagada'}>
                <td>{k.orden}</td>
                <td className="celda-doble"><strong>{k.nombre}</strong><small>{k.descripcion || ' '}</small></td>
                <td><InsigniaDestino destino={k.destino} /></td>
                <td>{contar(k.productos, 'producto')}{k.productos_86 ? ` · ${k.productos_86} con 86` : ''}</td>
                <td>{k.activo ? <Insignia tono="ok">En el menú</Insignia> : <Insignia tono="gray">Dada de baja</Insignia>}</td>
                <td><div className="acciones">
                  {k.activo ? (
                    <>
                      <button className="enlace" onClick={() => alEditar(k)}>Editar</button>
                      <button className="enlace gris" disabled={enviando || k.productos > 0}
                        title={k.productos ? 'Primero mueve sus productos a otra categoría o quítalos del menú' : undefined}
                        onClick={() => hacer(() => api.post(`/menu/categorias/${k.id}/dar-de-baja`), `La categoría ${k.nombre} quedó dada de baja.`)}>Dar de baja</button>
                    </>
                  ) : (
                    <button className="enlace" disabled={enviando}
                      onClick={() => hacer(() => api.post(`/menu/categorias/${k.id}/reactivar`), `La categoría ${k.nombre} se reactivó.`)}>Reactivar</button>
                  )}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explicacion>El orden es el de las fichas de categoría en la comanda (05b). Una categoría con productos no se da de baja: primero se mueven o se quitan del menú. Nada se borra, porque las comandas y los reportes la usan.</Explicacion>
    </>
  );
}

function DialogoProducto({ producto, categoriaId, categorias, alCerrar, alTerminar }) {
  const nuevo = !producto;
  const f = useFormulario(
    { categoria_id: String(producto?.categoria_id ?? categoriaId ?? ''), nombre: producto?.nombre ?? '', descripcion: producto?.descripcion ?? '', precio: producto?.precio ?? '' },
    (v) => (nuevo ? api.post('/menu/productos', v) : api.put(`/menu/productos/${producto.id}`, v)),
    (p) => alTerminar(nuevo ? `${p.nombre} se agregó al menú.` : `Se guardaron los cambios de ${p.nombre}.`),
  );
  const [quitar, setQuitar] = useState(false);
  const accion = useAccion(alTerminar);
  return (
    <Dialogo titulo={nuevo ? 'Nuevo producto' : `Editar ${producto.nombre}`} alCerrar={alCerrar} ancho={520}
      acciones={<>
        {!nuevo && !quitar && <button type="button" className="boton boton-peligro" onClick={() => setQuitar(true)}>Quitar del menú</button>}
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-producto" className="boton boton-primario compacto" disabled={f.enviando}>
          {f.enviando ? 'Guardando…' : nuevo ? 'Agregar al menú' : 'Guardar cambios'}
        </button>
      </>}>
      <form id="form-producto" className="rejilla-campos sin-margen" onSubmit={f.guardar} noValidate>
        <Selector etiqueta="Categoría" obligatorio value={f.valores.categoria_id} onChange={f.campo('categoria_id')} error={f.errores.categoria_id}
          ayuda="Decide si se prepara en cocina o en barra.">
          <option value="">Elige…</option>
          {categorias.map((k) => <option key={k.id} value={k.id}>{k.nombre} · {k.destino === 'barra' ? 'Barra' : 'Cocina'}</option>)}
        </Selector>
        <Entrada etiqueta="Precio" obligatorio value={f.valores.precio} onChange={f.campo('precio')} error={f.errores.precio}
          inputMode="decimal" placeholder="0.00" ayuda={nuevo ? undefined : 'Las comandas ya capturadas conservan su precio.'} />
        <div className="ancho-completo">
          <Entrada etiqueta="Nombre" obligatorio value={f.valores.nombre} onChange={f.campo('nombre')} error={f.errores.nombre} maxLength={120} autoFocus data-foco />
        </div>
        <div className="ancho-completo">
          <Entrada etiqueta="Descripción" value={f.valores.descripcion} onChange={f.campo('descripcion')} error={f.errores.descripcion} maxLength={250}
            placeholder="Ej. Con verduras al vapor" />
        </div>
      </form>
      {quitar && (
        <div className="confirmacion">
          <p>¿Quitar <strong>{producto.nombre}</strong> del menú? Ya no se podrá capturar en las comandas; lo vendido se conserva en los reportes y lo puedes regresar después.</p>
          <div className="botones">
            <button className="boton boton-secundario boton-chico" onClick={() => setQuitar(false)}>No</button>
            <button className="boton boton-peligro-lleno boton-chico" disabled={accion.enviando}
              onClick={() => accion.hacer(() => api.post(`/menu/productos/${producto.id}/dar-de-baja`), `${producto.nombre} ya no está en el menú.`)}>Sí, quitar</button>
          </div>
        </div>
      )}
      <Alerta>{f.error || accion.error}</Alerta>
    </Dialogo>
  );
}

function DialogoCategoria({ categoria, alCerrar, alTerminar }) {
  const nueva = !categoria;
  const f = useFormulario(
    { nombre: categoria?.nombre ?? '', descripcion: categoria?.descripcion ?? '', destino: categoria?.destino ?? 'cocina', orden: categoria?.orden ?? '' },
    (v) => (nueva ? api.post('/menu/categorias', v) : api.put(`/menu/categorias/${categoria.id}`, v)),
    (k) => alTerminar(nueva ? `Se creó la categoría ${k.nombre}.` : `Se guardaron los cambios de ${k.nombre}.`),
  );
  return (
    <Dialogo titulo={nueva ? 'Nueva categoría' : `Editar ${categoria.nombre}`} alCerrar={alCerrar} ancho={520}
      acciones={<>
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-categoria" className="boton boton-primario compacto" disabled={f.enviando}>
          {f.enviando ? 'Guardando…' : nueva ? 'Crear categoría' : 'Guardar cambios'}
        </button>
      </>}>
      <form id="form-categoria" className="rejilla-campos sin-margen" onSubmit={f.guardar} noValidate>
        <div className="ancho-completo">
          <Entrada etiqueta="Nombre" obligatorio value={f.valores.nombre} onChange={f.campo('nombre')} error={f.errores.nombre} maxLength={60} autoFocus data-foco />
        </div>
        <div className="campo-form">
          <span className="etiqueta">Se prepara en</span>
          <Segmentos opciones={DESTINOS} valor={f.valores.destino} alCambiar={f.campo('destino')} etiqueta="Se prepara en" />
          {f.errores.destino && <p className="campo-error">{f.errores.destino}</p>}
        </div>
        <Entrada etiqueta="Orden en el menú" value={f.valores.orden} onChange={f.campo('orden')} error={f.errores.orden} inputMode="numeric"
          placeholder={nueva ? 'Al final' : undefined} />
        <div className="ancho-completo">
          <Entrada etiqueta="Descripción" value={f.valores.descripcion} onChange={f.campo('descripcion')} error={f.errores.descripcion} maxLength={200} />
        </div>
      </form>
      <Explicacion tono="morado">Lo que se capture de esta categoría llega al panel de {f.valores.destino === 'barra' ? 'barra' : 'cocina'}.</Explicacion>
      <Alerta>{f.error}</Alerta>
    </Dialogo>
  );
}

function DialogoOchentaYSeis({ producto, alCerrar, alTerminar }) {
  const f = useFormulario({ motivo: '' }, (v) => api.post(`/menu/productos/${producto.id}/asignar-86`, v),
    (p) => alTerminar(`${p.nombre} quedó con 86: ya no se puede capturar.`));
  return (
    <Dialogo titulo={`Asignar 86 a ${producto.nombre}`} alCerrar={alCerrar}
      acciones={<>
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-86" className="boton boton-peligro-lleno" disabled={f.enviando}>{f.enviando ? 'Guardando…' : 'Asignar 86'}</button>
      </>}>
      <p>Sigue en el menú, pero los meseros lo verán como <strong>agotado</strong> y no lo podrán capturar hasta que se quite el 86.</p>
      <form id="form-86" onSubmit={f.guardar} noValidate>
        <Entrada etiqueta="Motivo" obligatorio value={f.valores.motivo} onChange={f.campo('motivo')} error={f.errores.motivo} maxLength={160}
          placeholder="Ej. Se terminó el limón amarillo" autoFocus data-foco />
      </form>
      <Alerta>{f.error}</Alerta>
    </Dialogo>
  );
}
