// 08 · Historial de ventas: tickets del día, cortes Z y cortes por mesero
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, descargar } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { useCambios } from '../../tiempoReal.js';
import { ahora } from '../../reloj.js';
import { contar, diaISO, dinero, fechaNumerica, hora, sinAcentos } from '../../formato.js';
import { imprimir } from '../../impresion.js';
import { AvisoExito, Encabezado } from '../../componentes/Pagina.jsx';
import { Buscador, Cargando, Explicacion, Indicador, Insignia, Pestanas } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Entrada } from '../../componentes/Formulario.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { useFormulario } from '../../usos.js';
import { SelectorFecha } from '../recepcion/Reservaciones.jsx';

export default function Ventas() {
  const { datos: sesion, tienePermiso } = useSesion();
  const [fecha, setFecha] = useState(() => diaISO(ahora()));
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [pestana, setPestana] = useState('tickets');
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState(null);
  const [corteZ, setCorteZ] = useState(null);

  const cargar = useCallback(() => api.get(`/ventas?fecha=${fecha}`).then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), [fecha]);
  useEffect(() => { cargar(); }, [cargar]);
  useCambios(['caja'], cargar);
  const quitarAviso = useCallback(() => setAviso(null), []);

  const q = sinAcentos(busqueda.trim());
  const tickets = useMemo(() => (datos?.tickets ?? []).filter((t) => !q || sinAcentos(`${t.folio} mesa ${t.mesa}`).includes(q)), [datos, q]);
  const r = datos?.resumen;
  // "Generar corte Z": el corte abierto de quien está en caja (o el único abierto)
  const abiertos = (datos?.cortes ?? []).filter((k) => k.estado === 'abierto');
  const miCorte = abiertos.find((k) => k.cajera === sesion.usuario.nombre_completo) ?? (abiertos.length === 1 ? abiertos[0] : null);

  return (
    <>
      <Encabezado titulo="Historial de ventas" subtitulo="Tickets y cortes del turno · se generan de las comandas y sus pagos">
        <SelectorFecha valor={fecha} alCambiar={setFecha} />
        <button className="boton boton-secundario" onClick={() => descargar(`/ventas/exportar?fecha=${fecha}`, `ventas-${fecha}.csv`).catch((e) => setError(e.message))}>
          <Ic.IconoNota width={17} height={17} />Exportar</button>
        {tienePermiso('caja.corte') && (
          <button className="boton boton-primario compacto" disabled={!miCorte} title={miCorte ? undefined : 'No hay una caja abierta'} onClick={() => setCorteZ(miCorte)}>
            <Ic.IconoCandado width={17} height={17} />Generar corte Z</button>
        )}
      </Encabezado>

      <div className="contenido">
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />
        <Alerta>{error}</Alerta>
        {!datos && !error && <Cargando />}
        {datos && (
          <>
            <div className="indicadores">
              <Indicador titulo="Ventas del día" valor={dinero(r.ventas)} detalle={contar(r.tickets, 'ticket')} />
              <Indicador titulo="Efectivo" valor={dinero(r.efectivo)} detalle={contar(r.operaciones_efectivo, 'operación', 'operaciones')} tono="ok" />
              <Indicador titulo="Tarjeta" valor={dinero(r.tarjeta)} detalle={contar(r.operaciones_tarjeta, 'operación', 'operaciones')} tono="info" />
              <Indicador titulo="Transferencia" valor={dinero(r.transferencia)} detalle={contar(r.operaciones_transferencia, 'operación', 'operaciones')} tono="morado" />
              <Indicador titulo="Cancelaciones" valor={dinero(r.monto_cancelado)} detalle={contar(r.cancelaciones, 'cancelación', 'cancelaciones')} tono="bad" />
            </div>
            <Pestanas valor={pestana} alCambiar={setPestana} opciones={[['tickets', 'Tickets del día'], ['cortes', 'Cortes Z'], ['meseros', 'Cortes por mesero']]} />

            {pestana === 'tickets' && (
              <div className="ventas-rejilla">
                <div>
                  <div className="filtros">
                    <Buscador valor={busqueda} alCambiar={setBusqueda} texto="Buscar por folio o mesa…" />
                    <p className="filtros-resumen">{contar(datos.tickets.length, 'ticket')}{miCorte?.turno ? ` · turno ${miCorte.turno.toLowerCase()}` : ''}</p>
                  </div>
                  <div className="tabla-envoltura">
                    <table className="tabla">
                      <thead><tr><th>Folio</th><th>Mesa</th><th>Mesero</th><th>Método</th><th>Hora</th><th>Total</th><th>Pagos</th></tr></thead>
                      <tbody>
                        {tickets.map((t) => (
                          <tr key={t.comanda_id} className={`clicable ${(elegido ?? tickets[0]?.comanda_id) === t.comanda_id ? 'resaltada' : ''}`}
                            onClick={() => setElegido(t.comanda_id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setElegido(t.comanda_id)}>
                            <td><strong>{t.folio}</strong></td><td>Mesa {t.mesa}</td><td>{t.mesero}</td><td>{t.metodo}</td>
                            <td>{hora(t.hora)}</td><td><strong>{dinero(t.total)}</strong></td><td className="texto-gris">{t.pagos_texto}</td>
                          </tr>
                        ))}
                        {!tickets.length && <tr><td colSpan={7} className="tabla-vacia">{q ? 'Ningún ticket coincide.' : 'No hay tickets este día.'}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <Explicacion>El ticket no se guarda: se genera de la comanda y sus pagos. Reimprimirlo da lo mismo siempre, porque el precio de cada producto y el IVA quedan congelados en la comanda.</Explicacion>
                </div>
                {(elegido ?? tickets[0]?.comanda_id) && <VistaTicket id={elegido ?? tickets[0].comanda_id} />}
              </div>
            )}
            {pestana === 'cortes' && <Cortes cortes={datos.cortes} alGenerar={setCorteZ} />}
            {pestana === 'meseros' && <CortesPorMesero meseros={datos.meseros} />}
          </>
        )}
      </div>
      {corteZ && <DialogoCorteZ corte={corteZ} alCerrar={() => setCorteZ(null)}
        alTerminar={(k) => { setCorteZ(null); setAviso(`Se cerró el corte ${k.folio}. Diferencia: ${dinero(k.diferencia)}.`); setPestana('cortes'); cargar(); }} />}
    </>
  );
}

function VistaTicket({ id }) {
  const { tienePermiso } = useSesion();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  useEffect(() => { setT(null); api.get(`/ventas/tickets/${id}`).then(setT).catch((e) => setError(e.message)); }, [id]);
  async function reimprimir() {
    setImprimiendo(true);
    setError(null);
    try { await imprimir(`/ventas/tickets/${id}/imprimir`, `Ticket ${t.folio}`); } catch (e) { setError(e.message); } finally { setImprimiendo(false); }
  }
  return (
    <aside className="tarjeta vista-ticket">
      <div className="vista-ticket-encabezado"><h2>Vista previa del ticket</h2>{t && <Insignia tono="purple">{t.folio}</Insignia>}</div>
      <Alerta>{error}</Alerta>
      {!t && !error && <Cargando />}
      {t && (
        <>
          <div className="ticket">
            <strong className="ticket-nombre">{(t.restaurante ?? 'KitchenLink').toUpperCase()}</strong>
            <span>Restaurante · {t.sucursal}</span>
            <span>RFC: {t.rfc}</span>
            <dl>
              <dt>Folio</dt><dd>{t.folio}</dd>
              <dt>Mesa</dt><dd>{t.mesa} · {contar(t.numero_personas, 'persona')}</dd>
              <dt>Mesero</dt><dd>{t.mesero}</dd>
              <dt>Fecha</dt><dd>{fechaNumerica(t.fecha)} {hora(t.fecha)}</dd>
            </dl>
            <ul>
              {t.lineas.map((l) => <li key={l.linea}><span>{l.cantidad}  {l.nombre_producto}</span><span>{dinero(l.importe)}</span></li>)}
            </ul>
            <dl>
              <dt>Subtotal</dt><dd>{dinero(t.subtotal)}</dd>
              <dt>IVA ({Math.round(Number(t.tasa_impuesto) * 100)} %)</dt><dd>{dinero(t.iva)}</dd>
              <dt className="total">TOTAL</dt><dd className="total">{dinero(t.total)}</dd>
            </dl>
            <dl className="pagos">
              {t.pagos.map((p) => [
                <dt key={`${p.id}-m`}>{p.metodo_etiqueta}</dt>, <dd key={`${p.id}-v`}>{dinero(p.monto)}</dd>,
                p.monto_recibido && <dt key={`${p.id}-r`} className="tenue">  recibido {dinero(p.monto_recibido)} · cambio</dt>,
                p.monto_recibido && <dd key={`${p.id}-c`} className="tenue">{dinero(p.cambio)}</dd>,
              ])}
            </dl>
            <span className="gracias">¡Gracias por su visita!</span>
          </div>
          {tienePermiso('ticket.emitir') && (
            <button className="boton boton-primario" onClick={reimprimir} disabled={imprimiendo}><Ic.IconoImpresora width={17} height={17} />{imprimiendo ? 'Imprimiendo…' : 'Reimprimir ticket'}</button>
          )}
        </>
      )}
    </aside>
  );
}

function Cortes({ cortes, alGenerar }) {
  const { tienePermiso } = useSesion();
  const [error, setError] = useState(null);
  return (
    <>
      <Alerta>{error}</Alerta>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead><tr><th>Corte</th><th>Cajera</th><th>Apertura</th><th>Cierre</th><th className="num">Fondo</th><th className="num">Efectivo</th>
            <th className="num">Tarjeta</th><th className="num">Transferencia</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferencia</th><th /></tr></thead>
          <tbody>
            {cortes.map((k) => (
              <tr key={k.id}>
                <td><strong>{k.folio}</strong><br /><Insignia tono={k.estado === 'abierto' ? 'ok' : 'gray'}>{k.estado_etiqueta}</Insignia></td>
                <td>{k.cajera}{k.turno && <small className="motivo">{k.turno}</small>}</td>
                <td>{hora(k.abierto_en)}</td><td>{k.cerrado_en ? hora(k.cerrado_en) : '—'}</td>
                <td className="num">{dinero(k.monto_apertura)}</td><td className="num">{dinero(k.efectivo)}</td><td className="num">{dinero(k.tarjeta)}</td>
                <td className="num">{dinero(k.transferencia)}</td><td className="num">{dinero(k.efectivo_esperado)}</td>
                <td className="num">{k.efectivo_declarado != null ? dinero(k.efectivo_declarado) : '—'}</td>
                <td className={`num ${Number(k.diferencia) < 0 ? 'texto-malo' : ''}`}>{k.diferencia != null ? dinero(k.diferencia) : '—'}</td>
                <td><div className="acciones">
                  {k.estado === 'abierto' && tienePermiso('caja.corte') && <button className="enlace" onClick={() => alGenerar(k)}>Corte Z</button>}
                  {k.estado === 'cerrado' && tienePermiso('caja.corte') && (
                    <button className="enlace gris" onClick={() => imprimir(`/ventas/cortes/${k.id}/imprimir`, `Corte ${k.folio}`).catch((e) => setError(e.message))}>Imprimir</button>
                  )}
                </div></td>
              </tr>
            ))}
            {!cortes.length && <tr><td colSpan={12} className="tabla-vacia">No hay cortes este día.</td></tr>}
          </tbody>
        </table>
      </div>
      <Explicacion>Del corte solo se guarda lo que captura la cajera: el fondo inicial y el efectivo que contó. Los totales por método y la diferencia se calculan de los pagos. Un corte cerrado ya no cambia.</Explicacion>
    </>
  );
}

function CortesPorMesero({ meseros }) {
  const total = meseros.reduce((s, m) => s + Number(m.total_cobrado), 0);
  return (
    <>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead><tr><th>Mesero</th><th className="num">Cuentas cobradas</th><th className="num">Comensales</th><th className="num">Efectivo</th><th className="num">Tarjeta y transferencia</th><th className="num">Total cobrado</th></tr></thead>
          <tbody>
            {meseros.map((m) => (
              <tr key={m.mesero_id}>
                <td><strong>{m.mesero}</strong></td><td className="num">{m.cuentas}</td><td className="num">{m.comensales}</td>
                <td className="num">{dinero(m.efectivo)}</td><td className="num">{dinero(m.otros_metodos)}</td><td className="num"><strong>{dinero(m.total_cobrado)}</strong></td>
              </tr>
            ))}
            {!meseros.length && <tr><td colSpan={6} className="tabla-vacia">Todavía no se cobra ninguna cuenta este día.</td></tr>}
            {meseros.length > 0 && <tr className="fila-total"><td>Total</td><td colSpan={4} /><td className="num">{dinero(total)}</td></tr>}
          </tbody>
        </table>
      </div>
      <Explicacion>Lo que caja cobró ese día de las mesas de cada mesero. Sirve para que cada mesero cuadre sus cuentas al final del turno.</Explicacion>
    </>
  );
}

function DialogoCorteZ({ corte: k, alCerrar, alTerminar }) {
  const f = useFormulario({ efectivo_declarado: '', observaciones: '' }, (v) => api.post(`/ventas/cortes/${k.id}/cerrar`, v), alTerminar);
  const contado = Number(String(f.valores.efectivo_declarado).replace(/[$,\s]/g, ''));
  const diferencia = f.valores.efectivo_declarado !== '' && Number.isFinite(contado) ? contado - Number(k.efectivo_esperado) : null;
  return (
    <Dialogo titulo={`Generar corte Z · ${k.folio}`} alCerrar={alCerrar} ancho={500}
      acciones={<>
        <button className="boton boton-secundario" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-corte" className="boton boton-primario compacto" disabled={f.enviando}>{f.enviando ? 'Cerrando…' : 'Cerrar corte'}</button>
      </>}>
      <p className="texto-tenue">{k.cajera} · abierto a las {hora(k.abierto_en)}. Al cerrarlo ya no cambia; para seguir cobrando se abre caja otra vez.</p>
      <dl className="totales caja">
        <dt>Fondo inicial</dt><dd>{dinero(k.monto_apertura)}</dd>
        <dt>Efectivo cobrado</dt><dd>{dinero(k.efectivo)}</dd>
        <dt>Tarjeta · Transferencia</dt><dd>{dinero(k.tarjeta)} · {dinero(k.transferencia)}</dd>
        <dt className="total">Efectivo esperado en el cajón</dt><dd className="total">{dinero(k.efectivo_esperado)}</dd>
      </dl>
      <form id="form-corte" onSubmit={f.guardar} className="formulario-corte" noValidate>
        <Entrada etiqueta="Efectivo contado" obligatorio value={f.valores.efectivo_declarado} onChange={f.campo('efectivo_declarado')}
          error={f.errores.efectivo_declarado} inputMode="decimal" placeholder="$0.00" autoFocus data-foco />
        <Entrada etiqueta="Observaciones" value={f.valores.observaciones} onChange={f.campo('observaciones')} error={f.errores.observaciones} maxLength={300} />
      </form>
      {diferencia != null && (
        <div className={`cambio${diferencia < 0 ? ' falta' : ''}`}><span>{diferencia === 0 ? 'Cuadra exacto' : diferencia < 0 ? 'Falta' : 'Sobra'}</span><strong>{dinero(Math.abs(diferencia))}</strong></div>
      )}
      <Alerta>{f.error}</Alerta>
    </Dialogo>
  );
}
