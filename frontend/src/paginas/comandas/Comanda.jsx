// 05b · Comanda (mesero; el gerente también la puede trabajar)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useCambios } from '../../tiempoReal.js';
import { contar, dinero, dineroCorto, hora, sinAcentos } from '../../formato.js';
import { AvisoExito } from '../../componentes/Pagina.jsx';
import { Buscador, Cargando, Explicacion, Fichas, Insignia, Segmentos } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Entrada } from '../../componentes/Formulario.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { useAccion, useFormulario } from '../../usos.js';
import { Contador } from './AbrirComanda.jsx';
import { DialogoCambiarMesa, DialogoCambiarPersonas } from '../mesas/MisMesas.jsx';

const TIEMPOS = [[1, '1er tiempo'], [2, '2º tiempo'], [3, '3er tiempo']];
// Tiempo sugerido al cambiar de categoría: entradas y bebidas 1er, platos fuertes 2º, postres 3er
const tiempoDe = (categoria = '') => (/postre/i.test(categoria) ? 3 : /fuerte/i.test(categoria) ? 2 : 1);
const ESTADO = {
  abierta: ['ok', 'Abierta: se puede seguir agregando'],
  por_cobrar: ['warn', 'Por cobrar: caja ya puede cobrarla'],
  cerrada: ['gray', 'Cerrada: ya se cobró'],
  cancelada: ['bad', 'Cancelada'],
};

export default function Comanda() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [datos, setDatos] = useState(null);
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [dialogo, setDialogo] = useState(null);
  const [categoria, setCategoria] = useState(null);
  const [tiempo, setTiempo] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);

  const cargar = useCallback(() => api.get(`/comandas/${id}`).then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), [id]);
  const cargarMenu = useCallback(() => api.get('/menu').then(setMenu).catch(() => {}), []);
  useEffect(() => { cargar(); cargarMenu(); }, [cargar, cargarMenu]);
  useCambios(['comandas', 'produccion'], cargar, { respaldoMs: 5_000 });
  useCambios(['menu'], cargarMenu);
  const quitarAviso = useCallback(() => setAviso(null), []);
  const listo = (texto, r) => { setDialogo(null); setAviso(texto); if (r?.comanda) setDatos(r); else cargar(); };

  const categorias = menu?.categorias ?? [];
  const cat = categorias.find((k) => k.id === categoria) ?? categorias[0];
  const q = sinAcentos(busqueda.trim());
  const productos = useMemo(() => (menu?.productos ?? []).filter((p) => (q ? sinAcentos(p.nombre).includes(q) : p.categoria_id === cat?.id)), [menu, q, cat]);

  if (error && !datos) return <div className="contenido"><Alerta>{error}</Alerta><Link className="enlace" to="/comandas">Volver a comandas</Link></div>;
  if (!datos) return <div className="contenido"><Cargando texto="Cargando la comanda…" /></div>;

  const { comanda: c, lineas, puede } = datos;
  const sinEnviar = lineas.filter((l) => l.estado === 'sin_enviar');
  const enviadas = lineas.filter((l) => l.estado !== 'sin_enviar');
  const envios = [...new Set(enviadas.map((l) => l.envio_numero))];
  const trabaja = puede.trabajar;
  const [tonoEstado, textoEstado] = ESTADO[c.estado];

  async function hacer(fn, texto) {
    setEnviando(true);
    setErrorAccion(null);
    try {
      const r = await fn();
      setDatos(r);
      if (texto) setAviso(texto);
    } catch (e) {
      setErrorAccion(e.message);
    } finally {
      setEnviando(false);
    }
  }
  const agregar = (p) => hacer(() => api.post(`/comandas/${c.id}/productos`, { producto_id: p.id, tiempo }));

  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Mesa {c.mesa} · Comanda {c.folio}</h1>
          <p>{contar(c.numero_personas, 'persona')} · Abierta a las {hora(c.abierta_en)} · Mesero: {c.mesero}
            {c.reservacion && ` · Reservación de ${c.reservacion}`}{c.lista_espera && ` · ${c.lista_espera} (lista de espera)`}</p>
        </div>
        <div className="encabezado-acciones">
          <Insignia tono={tonoEstado} className="grande">{textoEstado}</Insignia>
          {trabaja && (
            <button className="boton boton-secundario" onClick={() => api.get('/mesas').then((m) => setDialogo({ tipo: 'mesa', mesas: m.mesas }))}>
              <Ic.IconoIntercambio width={17} height={17} />Cambiar mesa</button>
          )}
          {trabaja && (
            <button className="boton boton-secundario" onClick={() => setDialogo({ tipo: 'personas' })}><Ic.IconoPersonas width={17} height={17} />Personas</button>
          )}
          {(trabaja || puede.supervisar) && ['abierta', 'por_cobrar'].includes(c.estado) && (
            <button className="boton boton-secundario" onClick={() => setDialogo({ tipo: 'transferir' })}><Ic.IconoPersona width={17} height={17} />Transferir</button>
          )}
        </div>
      </header>

      <div className="contenido comanda">
        <section className="comanda-captura">
          <AvisoExito texto={aviso} alTerminar={quitarAviso} />
          {!trabaja && c.estado === 'abierta' && (
            <Explicacion tono="ambar">La atiende {c.mesero}: para tomarla, {c.mesero.split(' ')[0]} o el gerente te la transfieren.</Explicacion>
          )}
          {c.estado === 'por_cobrar' && (
            <Explicacion tono="ambar">Ya se pidió la cuenta: caja imprime el pre-ticket y cobra. Si la mesa pide algo más, la cajera cancela el pre-ticket y la comanda vuelve a Abierta.</Explicacion>
          )}
          {['cerrada', 'cancelada'].includes(c.estado) && (
            <Explicacion>La comanda está {c.estado === 'cerrada' ? 'cerrada (ya se cobró)' : 'cancelada'}: no se reabre. Si piden algo más, se abre una comanda nueva en la mesa.</Explicacion>
          )}

          {trabaja && (
            <>
              <div className="comanda-barra">
                <Buscador valor={busqueda} alCambiar={setBusqueda} texto="Buscar producto…" />
                <div className="comanda-tiempo">
                  <span>Tiempo de lo que agregues:</span>
                  <Segmentos opciones={TIEMPOS} valor={tiempo} alCambiar={setTiempo} etiqueta="Tiempo de lo que agregues" />
                </div>
              </div>
              <Fichas valor={cat?.id} etiqueta="Categorías" opciones={categorias.map((k) => [k.id, k.nombre])}
                alCambiar={(k) => { setCategoria(k); setBusqueda(''); setTiempo(tiempoDe(categorias.find((x) => x.id === k)?.nombre)); }} />
              <div className="rejilla-productos">
                {productos.map((p) => (
                  <button key={p.id} type="button" className={`tarjeta-producto${p.disponible ? '' : ' agotado'}`} disabled={!p.disponible || enviando}
                    onClick={() => agregar(p)} title={p.disponible ? `Agregar ${p.nombre} (${TIEMPOS[tiempo - 1][1]})` : p.motivo_no_disponible ?? '86'}>
                    <strong>{p.nombre}</strong>
                    <small>{q ? p.categoria : p.descripcion || ' '}</small>
                    <span className="tarjeta-producto-pie">
                      <span className="precio">{dineroCorto(p.precio)}</span>
                      {p.disponible ? <span className="mas" aria-hidden="true"><Ic.IconoMas width={16} height={16} /></span>
                        : <Insignia tono="bad">86 · agotado</Insignia>}
                    </span>
                  </button>
                ))}
                {!productos.length && <p className="texto-tenue">{q ? 'Ningún producto coincide.' : 'Sin productos en esta categoría.'}</p>}
              </div>
              <Explicacion>Lo que toques se agrega a «Sin enviar». Nada llega a cocina ni a barra hasta que presiones Enviar. Si la mesa pide más después, se hace un envío nuevo en esta misma comanda.</Explicacion>
              <Explicacion tono="morado">Los tiempos le indican a cocina en qué orden sacar los platillos: 1er tiempo (entradas), 2º (platos fuertes), 3er (postres).</Explicacion>
              <Explicacion icono={Ic.IconoNota}>Término de la carne, guarnición y peticiones especiales se escriben en «Nota» de cada producto. Cocina o barra lo decide la categoría del producto.</Explicacion>
            </>
          )}
          {(datos.pagos.length > 0 || datos.cancelaciones.length > 0 || datos.eventos.length > 0) && <Movimientos datos={datos} />}
        </section>

        <aside className="tarjeta detalle-comanda">
          <div className="detalle-comanda-encabezado">
            <h2>Detalle de la comanda</h2><span>#{c.folio}</span>
          </div>
          {c.nota_general ? (
            <button type="button" className="nota-mesa" disabled={!trabaja} onClick={() => setDialogo({ tipo: 'nota' })}>
              <Ic.IconoAlerta width={17} height={17} />Nota de mesa: {c.nota_general.charAt(0).toLowerCase() + c.nota_general.slice(1)}
            </button>
          ) : trabaja && <button type="button" className="enlace agregar-nota" onClick={() => setDialogo({ tipo: 'nota' })}>+ Nota de mesa (alergias)</button>}

          {enviadas.length > 0 && <h3 className="seccion-comanda">Enviado a cocina y barra</h3>}
          {envios.map((n) => {
            const del = enviadas.filter((l) => l.envio_numero === n);
            return (
              <div key={n} className="envio">
                <h4>{del[0].envio_texto}</h4>
                {del.map((l) => (
                  <Linea key={l.id} l={l} acciones={trabaja && l.estado !== 'cancelado' && (
                    <>
                      {l.estado === 'listo' && (
                        <button className="enlace" disabled={enviando} onClick={() => hacer(() => api.post(`/comandas/${c.id}/entregar`, { linea_id: l.id }), `${l.nombre_producto}: entregado en la mesa.`)}>Entregar</button>
                      )}
                      <button className="enlace gris" onClick={() => setDialogo({ tipo: 'cancelar', linea: l })}>Cancelar</button>
                    </>
                  )}>
                    <Insignia tono={l.estado_tono}>{l.estado_etiqueta}</Insignia>
                  </Linea>
                ))}
              </div>
            );
          })}

          {sinEnviar.length > 0 && (
            <div className="sin-enviar">
              <h3 className="seccion-comanda">Sin enviar ({sinEnviar.length})</h3>
              {sinEnviar.map((l) => (
                <Linea key={l.id} l={l} morado>
                  {trabaja && <>
                    <button className="enlace" onClick={() => setDialogo({ tipo: 'linea', linea: l })}>Nota</button>
                    <button className="enlace gris" disabled={enviando} onClick={() => hacer(() => api.borrar(`/comandas/${c.id}/productos/${l.id}`))}>Quitar</button>
                  </>}
                </Linea>
              ))}
            </div>
          )}
          {!lineas.length && <p className="texto-tenue detalle-vacio">Toca un producto del menú para agregarlo.</p>}

          <dl className="totales">
            <dt>Subtotal (enviado + sin enviar)</dt><dd>{dinero(c.subtotal)}</dd>
            <dt>IVA ({Math.round(Number(c.tasa_impuesto) * 100)} %)</dt><dd>{dinero(c.iva)}</dd>
            <dt className="total">Total</dt><dd className="total">{dinero(c.total)}</dd>
            {Number(c.pagado) > 0 && <><dt>Pagado</dt><dd>{dinero(c.pagado)}</dd></>}
          </dl>
          <Alerta>{errorAccion}</Alerta>
          {trabaja && (
            <>
              <button className="boton boton-primario" disabled={!sinEnviar.length || enviando}
                onClick={() => hacer(() => api.post(`/comandas/${c.id}/enviar`), `Se enviaron ${contar(sinEnviar.length, 'producto')} a cocina y barra.`)}>
                <Ic.IconoFlecha width={18} height={18} />{sinEnviar.length ? `Enviar ${contar(sinEnviar.length, 'producto nuevo', 'productos nuevos')}` : 'Nada nuevo por enviar'}
              </button>
              <button className="boton boton-secundario ancho" disabled={enviando}
                onClick={() => hacer(() => api.post(`/comandas/${c.id}/pedir-cuenta`), 'Se pidió la cuenta: caja ya puede imprimir el pre-ticket.')}>
                <Ic.IconoRecibo width={17} height={17} />Pedir la cuenta</button>
            </>
          )}
          {(trabaja || (puede.supervisar && c.estado === 'por_cobrar')) && Number(c.pagado) === 0 && (
            <button className="enlace peligro centrado" onClick={() => setDialogo({ tipo: 'cancelar' })}>Cancelar comanda · requiere autorización del gerente</button>
          )}
          {['cerrada', 'cancelada'].includes(c.estado) && <button className="boton boton-secundario ancho" onClick={() => navegar(-1)}>Volver</button>}
        </aside>
      </div>

      {dialogo?.tipo === 'linea' && <DialogoLinea comanda={c} linea={dialogo.linea} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
      {dialogo?.tipo === 'nota' && <DialogoNotaMesa comanda={c} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
      {dialogo?.tipo === 'cancelar' && <DialogoCancelar comanda={c} linea={dialogo.linea} supervisa={puede.supervisar} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
      {dialogo?.tipo === 'transferir' && <DialogoTransferir comanda={c} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
      {dialogo?.tipo === 'mesa' && <DialogoCambiarMesa comanda={c} mesas={dialogo.mesas} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
      {dialogo?.tipo === 'personas' && <DialogoCambiarPersonas comanda={c} capacidad={c.mesa_capacidad} alCerrar={() => setDialogo(null)} alTerminar={listo} />}
    </>
  );
}

function Linea({ l, morado, acciones, children }) {
  return (
    <div className={`linea-comanda${l.estado === 'cancelado' ? ' cancelada' : ''}`}>
      <span className={`cantidad${morado ? ' morado' : ''}`}>{l.cantidad}×</span>
      <div className="linea-texto">
        <strong>{l.nombre_producto}</strong>
        <small>{l.detalle_texto}</small>
        {acciones && <span className="linea-acciones izquierda">{acciones}</span>}
      </div>
      <div className="linea-derecha">
        <strong>{dinero(l.importe)}</strong>
        <span className="linea-acciones">{children}</span>
      </div>
    </div>
  );
}

/** Pagos, cancelaciones y movimientos de la comanda */
function Movimientos({ datos }) {
  return (
    <section className="tarjeta movimientos">
      <h2>Movimientos</h2>
      <ol className="linea-tiempo">
        {datos.eventos.map((e) => (
          <li key={`${e.accion}-${e.registrado_en}`}><span className="linea-tiempo-fecha">{hora(e.registrado_en)}{e.hecho_por && ` · ${e.hecho_por}`}</span><span>{e.texto}</span></li>
        ))}
        {datos.cancelaciones.map((k) => (
          <li key={`k-${k.hora}-${k.producto}`}><span className="linea-tiempo-fecha">{hora(k.hora)} · pidió {k.solicito}, autorizó {k.autorizo}</span>
            <span>Cancelación de {k.producto ? `${k.cantidad}× ${k.producto}` : 'la comanda'} ({dinero(k.monto)}): {k.motivo}</span></li>
        ))}
        {datos.pagos.map((p) => (
          <li key={`p-${p.registrado_en}-${p.monto}`}><span className="linea-tiempo-fecha">{hora(p.registrado_en)} · cobró {p.cobro}</span>
            <span>Pago con {p.metodo_etiqueta.toLowerCase()}: {dinero(p.monto)}{p.cambio ? ` · cambio ${dinero(p.cambio)}` : ''}</span></li>
        ))}
      </ol>
    </section>
  );
}

function DialogoLinea({ comanda, linea, alCerrar, alTerminar }) {
  const f = useFormulario({ cantidad: linea.cantidad, tiempo: linea.tiempo, nota: linea.nota ?? '' },
    (v) => api.put(`/comandas/${comanda.id}/productos/${linea.id}`, v), (r) => alTerminar(`${linea.nombre_producto}: se guardó la nota.`, r));
  return (
    <Dialogo titulo={linea.nombre_producto} alCerrar={alCerrar} ancho={500}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-linea" className="boton boton-primario compacto" disabled={f.enviando}>Guardar</button>
      </>}>
      <form id="form-linea" onSubmit={f.guardar} className="formulario-linea" noValidate>
        <div className="campo-form"><span className="etiqueta">Cantidad</span>
          <Contador valor={Number(f.valores.cantidad)} alCambiar={f.campo('cantidad')} max={99} singular="pieza" /></div>
        <div className="campo-form"><span className="etiqueta">Tiempo</span>
          <Segmentos opciones={TIEMPOS} valor={Number(f.valores.tiempo)} alCambiar={f.campo('tiempo')} etiqueta="Tiempo" /></div>
        <Entrada etiqueta="Nota" value={f.valores.nota} onChange={f.campo('nota')} error={f.errores.nota} maxLength={250} autoFocus data-foco
          placeholder="Término, guarnición, sin cebolla…" ayuda="Cocina la ve en la tarjeta del envío." />
      </form>
      <Alerta>{f.error}</Alerta>
    </Dialogo>
  );
}

function DialogoNotaMesa({ comanda, alCerrar, alTerminar }) {
  const f = useFormulario({ nota_general: comanda.nota_general ?? '' },
    (v) => api.put(`/comandas/${comanda.id}/nota`, v), (r) => alTerminar('Se guardó la nota de mesa: cocina la ve en cada tarjeta.', r));
  return (
    <Dialogo titulo={`Nota de la Mesa ${comanda.mesa}`} alCerrar={alCerrar}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-nota" className="boton boton-primario compacto" disabled={f.enviando}>Guardar</button>
      </>}>
      <form id="form-nota" onSubmit={f.guardar} noValidate>
        <Entrada etiqueta="Nota de mesa" value={f.valores.nota_general} onChange={f.campo('nota_general')} error={f.errores.nota_general}
          maxLength={300} autoFocus data-foco placeholder="Ej. Un comensal es alérgico al cacahuate" />
      </form>
      <p className="texto-tenue">Se muestra en rojo en la comanda y en cada tarjeta de cocina y barra.</p>
      <Alerta>{f.error}</Alerta>
    </Dialogo>
  );
}

/** Cancelar un producto enviado o la comanda: motivo y autorización del gerente */
function DialogoCancelar({ comanda, linea, supervisa, alCerrar, alTerminar }) {
  const f = useFormulario({ motivo: '', usuario: '', contrasena: '' },
    (v) => api.post(linea ? `/comandas/${comanda.id}/productos/${linea.id}/cancelar` : `/comandas/${comanda.id}/cancelar`,
      { motivo: v.motivo, ...(supervisa ? {} : { autoriza: { usuario: v.usuario, contrasena: v.contrasena } }) }),
    (r) => alTerminar(linea ? `Se canceló ${linea.cantidad}× ${linea.nombre_producto}.` : `Se canceló la comanda ${comanda.folio}: la Mesa ${comanda.mesa} quedó libre.`, r));
  return (
    <Dialogo titulo={linea ? `Cancelar ${linea.cantidad}× ${linea.nombre_producto}` : `Cancelar la comanda ${comanda.folio}`} alCerrar={alCerrar} ancho={500}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>No cancelar</button>
        <button type="submit" form="form-cancelar" className="boton boton-peligro-lleno" disabled={f.enviando}>{f.enviando ? 'Cancelando…' : 'Cancelar'}</button>
      </>}>
      <p>{linea ? 'El producto ya se envió: se cancela con motivo y queda en el reporte de cancelaciones.'
        : 'Lo que no se envió se quita y lo enviado se cancela. La mesa queda libre. Queda en el reporte de cancelaciones.'}</p>
      <form id="form-cancelar" className="formulario-cancelar" onSubmit={f.guardar} noValidate>
        <Entrada etiqueta="Motivo" obligatorio value={f.valores.motivo} onChange={f.campo('motivo')} error={f.errores.motivo} maxLength={250}
          autoFocus data-foco placeholder="Ej. Tardó demasiado, error de captura" />
        {!supervisa && (
          <fieldset className="autoriza">
            <legend><Ic.IconoCandado width={16} height={16} />Autoriza el gerente</legend>
            <Entrada etiqueta="Usuario" value={f.valores.usuario} onChange={f.campo('usuario')} autoComplete="off" />
            <Entrada etiqueta="Contraseña" type="password" value={f.valores.contrasena} onChange={f.campo('contrasena')} autoComplete="new-password" />
            {f.errores.autoriza && <p className="campo-error">{f.errores.autoriza}</p>}
          </fieldset>
        )}
      </form>
      <Alerta>{f.error}</Alerta>
    </Dialogo>
  );
}

function DialogoTransferir({ comanda, alCerrar, alTerminar }) {
  const [meseros, setMeseros] = useState([]);
  const [elegido, setElegido] = useState('');
  const accion = useAccion(alTerminar);
  useEffect(() => { api.get('/comandas/meseros').then(setMeseros).catch(() => {}); }, []);
  const otros = meseros.filter((m) => m.id !== comanda.mesero_usuario_id);
  const destino = otros.find((m) => String(m.id) === elegido);
  return (
    <Dialogo titulo={`Transferir la comanda ${comanda.folio}`} alCerrar={alCerrar}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button className="boton boton-primario compacto" disabled={!destino || accion.enviando}
          onClick={() => accion.hacer(() => api.post(`/comandas/${comanda.id}/transferir`, { mesero_usuario_id: destino.id }),
            `La Mesa ${comanda.mesa} ahora la atiende ${destino.nombre_completo}.`)}>Transferir</button>
      </>}>
      <p>Por cambio de turno o descanso: desde ese momento la trabaja el nuevo mesero. Queda en la bitácora.</p>
      <div className="campo-form">
        <label htmlFor="transferir-a">Pasarla a</label>
        <select id="transferir-a" className="selector" value={elegido} onChange={(e) => setElegido(e.target.value)} data-foco>
          <option value="">Elige un mesero…</option>
          {otros.map((m) => <option key={m.id} value={m.id}>{m.nombre_completo} · {m.rol}</option>)}
        </select>
      </div>
      <Alerta>{accion.error}</Alerta>
    </Dialogo>
  );
}
