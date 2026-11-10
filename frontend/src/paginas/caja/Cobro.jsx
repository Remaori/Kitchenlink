// 07 · Cobro (cajera)
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useSesion } from '../../sesion/ContextoSesion.jsx';
import { useCambios } from '../../tiempoReal.js';
import { contar, dinero, hora } from '../../formato.js';
import { imprimir } from '../../impresion.js';
import { AvisoExito, Encabezado } from '../../componentes/Pagina.jsx';
import { Cargando, Explicacion, Insignia } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Entrada } from '../../componentes/Formulario.jsx';
import { Dialogo } from '../../componentes/Dialogo.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { useAccion, useFormulario, useRecientes } from '../../usos.js';

const METODOS = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia']];
const num = (v) => Number(String(v ?? '').replace(/[$,\s]/g, '')) || 0;
const turno = (t) => (t ? ` · Turno ${t.toLowerCase()}` : '');

export default function Cobro() {
  const { tienePermiso } = useSesion();
  const [parametros] = useSearchParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [elegida, setElegida] = useState(() => Number(parametros.get('comanda')) || null);
  const [cuenta, setCuenta] = useState(null);
  const [arqueo, setArqueo] = useState(false);

  const cargar = useCallback(() => api.get('/caja').then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  useCambios(['caja', 'comandas'], cargar);
  const quitarAviso = useCallback(() => setAviso(null), []);

  const porCobrar = datos?.por_cobrar ?? [];
  // Se iluminan un momento las mesas que acaban de pedir la cuenta o que cambiaron de total
  const reciente = useRecientes(datos?.por_cobrar, (c) => c.comanda_id, (c) => c.falta);
  const abiertaReciente = useRecientes(datos?.abiertas, (c) => c.comanda_id, (c) => c.total);
  const id = porCobrar.some((c) => c.comanda_id === elegida) ? elegida : porCobrar[0]?.comanda_id;
  const cargarCuenta = useCallback(() => (id ? api.get(`/caja/cuentas/${id}`).then(setCuenta).catch((e) => setError(e.message)) : setCuenta(null)), [id]);
  useEffect(() => { cargarCuenta(); }, [cargarCuenta]);
  useCambios(['comandas', 'produccion'], cargarCuenta);

  const corte = datos?.corte;
  const cobrado = (texto) => { setAviso(texto); cargar(); };

  return (
    <>
      <Encabezado titulo="Cobro" subtitulo={corte ? `Caja abierta desde las ${hora(corte.abierto_en)}${turno(corte.turno)}` : 'Abre caja para empezar a cobrar'}>
        {corte && <Insignia tono="ok" className="grande">Caja abierta</Insignia>}
        {corte && <button className="boton boton-secundario" onClick={() => setArqueo(true)}><Ic.IconoCandado width={17} height={17} />Arqueo de caja</button>}
      </Encabezado>

      <div className="contenido">
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />
        <Alerta>{error}</Alerta>
        {!datos && !error && <Cargando />}
        {datos && !corte && tienePermiso('caja.corte') && <AbrirCaja alTerminar={(k) => cobrado(`Se abrió la caja con el corte ${k.folio}.`)} />}
        {datos && !corte && !tienePermiso('caja.corte') && <Explicacion tono="ambar">No tienes la caja abierta. La abre quien hace los cortes de caja.</Explicacion>}

        {datos && (
          <div className="cobro">
            <section className="tarjeta lista-cuentas">
              <div className="tarjeta-encabezado">
                <div><h2>Por cobrar</h2><p className="tarjeta-sub">Mesas que pidieron la cuenta</p></div>
                <Insignia tono="warn">{contar(porCobrar.length, 'mesa')}</Insignia>
              </div>
              <ul>
                {porCobrar.map((c) => (
                  <li key={c.comanda_id}>
                    <button type="button" className={`${c.comanda_id === id ? 'elegida' : ''}${reciente(c)}`} onClick={() => setElegida(c.comanda_id)}>
                      <span><strong>Mesa {c.mesa}</strong><small>{contar(c.numero_personas, 'persona')} · {c.mesero}</small></span>
                      <span className="monto">{dinero(c.falta)}</span>
                    </button>
                  </li>
                ))}
                {!porCobrar.length && <li className="agenda-vacia">Ninguna mesa ha pedido la cuenta.</li>}
              </ul>
              <h3>Abiertas · aún no piden la cuenta</h3>
              <p className="tarjeta-sub">Se cobran cuando el mesero pide la cuenta.</p>
              <ul className="abiertas">
                {datos.abiertas.map((c) => (
                  <li key={c.comanda_id} className={abiertaReciente(c).trim() || undefined}>
                    <span><strong>Mesa {c.mesa}</strong><small>{contar(c.numero_personas, 'persona')} · {c.mesero}</small></span>
                    <span className="monto">{dinero(c.total)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {cuenta && id ? (
              <>
                <Cuenta cuenta={cuenta} alTerminar={(texto) => { cobrado(texto); setElegida(null); }} />
                <RegistrarPago cuenta={cuenta} hayCaja={!!corte} alTerminar={(r) => {
                  if (r.cerrada) cobrado(`La comanda ${r.ticket.folio} se cerró: se generó el ticket y la Mesa ${r.ticket.mesa} quedó libre.`);
                  else { setCuenta(r.ticket); cobrado(`Se registró el pago. Falta ${dinero(r.ticket.falta)}.`); }
                }} />
              </>
            ) : (
              <section className="tarjeta cobro-vacio"><p className="texto-tenue">Cuando un mesero pida la cuenta, aquí aparece su pre-ticket para cobrarla.</p></section>
            )}
          </div>
        )}
      </div>
      {arqueo && <DialogoArqueo alCerrar={() => setArqueo(false)} />}
    </>
  );
}

function AbrirCaja({ alTerminar }) {
  const f = useFormulario({ monto_apertura: '', turno: '' }, (v) => api.post('/caja/abrir', v), alTerminar);
  return (
    <form className="tarjeta abrir-caja" onSubmit={f.guardar} noValidate>
      <h2>Abrir caja</h2>
      <p className="tarjeta-sub">Cuenta el fondo con el que empiezas. Los pagos que registres entran a este corte hasta el corte Z.</p>
      <div className="rejilla-campos">
        <Entrada etiqueta="Fondo inicial" value={f.valores.monto_apertura} onChange={f.campo('monto_apertura')} error={f.errores.monto_apertura} inputMode="decimal" placeholder="0.00" />
        <Entrada etiqueta="Turno" value={f.valores.turno} onChange={f.campo('turno')} error={f.errores.turno} maxLength={30} placeholder="Ej. Vespertino" />
      </div>
      <Alerta>{f.error}</Alerta>
      <button className="boton boton-primario compacto" disabled={f.enviando}>Abrir caja</button>
    </form>
  );
}

function Cuenta({ cuenta: t, alTerminar }) {
  const { tienePermiso } = useSesion();
  const accion = useAccion(alTerminar);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [errorImpresion, setErrorImpresion] = useState(null);
  async function imprimirPreTicket() {
    setImprimiendo(true);
    setErrorImpresion(null);
    try { await imprimir(`/caja/cuentas/${t.comanda_id}/imprimir`, `Pre-ticket ${t.folio}`); } catch (e) { setErrorImpresion(e.message); } finally { setImprimiendo(false); }
  }
  return (
    <section className="tarjeta cuenta">
      <div className="tarjeta-encabezado">
        <div>
          <h2>Cuenta · Mesa {t.mesa}</h2>
          <p className="tarjeta-sub">Comanda #{t.folio} · Mesero {t.mesero} · pidió la cuenta a las {hora(t.cuenta_pedida_en)}</p>
        </div>
        <Insignia tono="warn">Por cobrar</Insignia>
      </div>
      <ul className="renglones">
        {t.lineas.map((l) => (
          <li key={l.linea}>
            <span className="cantidad">{l.cantidad}×</span>
            <span className="renglon-texto"><strong>{l.nombre_producto}</strong><small>{[l.detalle_texto, l.en_cocina && 'aún en cocina'].filter(Boolean).join(' · ')}</small></span>
            <span className="monto">{dinero(l.importe)}</span>
          </li>
        ))}
      </ul>
      <dl className="totales caja">
        <dt>Subtotal</dt><dd>{dinero(t.subtotal)}</dd>
        <dt>IVA ({Math.round(Number(t.tasa_impuesto) * 100)} %)</dt><dd>{dinero(t.iva)}</dd>
        <dt className="tenue">Propina sugerida (10 %) · no se suma</dt><dd className="tenue">{dinero(t.propina_sugerida)}</dd>
        <dt className="total">Total a cobrar</dt><dd className="total">{dinero(t.total)}</dd>
      </dl>
      <div className="pre-ticket">
        <h3><Ic.IconoRecibo width={18} height={18} />Pre-ticket de la comanda {t.folio}</h3>
        <div className="botones">
          <button className="boton boton-secundario" disabled={imprimiendo || !tienePermiso('ticket.pre_ticket')} onClick={imprimirPreTicket}>
            <Ic.IconoImpresora width={17} height={17} />{imprimiendo ? 'Imprimiendo…' : 'Imprimir pre-ticket'}</button>
          {Number(t.pagado) === 0 && tienePermiso('ticket.pre_ticket') && (
            <button className="boton boton-peligro" disabled={accion.enviando}
              onClick={() => accion.hacer(() => api.post(`/caja/cuentas/${t.comanda_id}/cancelar-pre-ticket`),
                `Se canceló el pre-ticket: la comanda ${t.folio} volvió a Abierta y ${t.mesero.split(' ')[0]} puede agregar.`)}>Cancelar pre-ticket</button>
          )}
        </div>
        <p className="texto-tenue">Si la mesa pide algo más, cancela el pre-ticket: la comanda vuelve a Abierta y el mesero puede agregar.</p>
        <Alerta>{accion.error || errorImpresion}</Alerta>
      </div>
      <Explicacion>El pre-ticket y el ticket no se guardan: se generan de la comanda y sus pagos. Para dividir la cuenta se registran varios pagos.</Explicacion>
    </section>
  );
}

function RegistrarPago({ cuenta: t, hayCaja, alTerminar }) {
  const inicial = { metodo: 'efectivo', monto: t.falta, monto_recibido: '', referencia: '' };
  const f = useFormulario(inicial, (v) => api.post(`/caja/cuentas/${t.comanda_id}/pagos`, v), (r) => { f.setValores({ ...inicial, monto: r.ticket.falta }); alTerminar(r); });
  useEffect(() => { f.setValores({ ...inicial, monto: t.falta }); }, [t.comanda_id, t.falta]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = f.valores;
  const cambio = v.metodo === 'efectivo' && v.monto_recibido !== '' ? num(v.monto_recibido) - num(v.monto) : null;
  return (
    <form className="tarjeta registrar-pago" onSubmit={f.guardar} noValidate>
      <h2>Registrar pago</h2>
      <p className="tarjeta-sub">Cuenta de la Mesa {t.mesa} · se puede pagar en partes</p>
      <div className="total-a-cobrar">
        <span>Total a cobrar</span>
        <strong>{dinero(t.total)}</strong>
        <small>Pagado {dinero(t.pagado)} · Falta {dinero(t.falta)}</small>
      </div>
      <div className="campo-form">
        <span className="etiqueta">Método de pago</span>
        <div className="metodos">
          {METODOS.map(([m, texto]) => (
            <button key={m} type="button" className={v.metodo === m ? 'activo' : ''} aria-pressed={v.metodo === m} onClick={() => f.campo('metodo')(m)}>{texto}</button>
          ))}
        </div>
      </div>
      <div className="rejilla-campos">
        <Entrada etiqueta="Monto de este pago" value={v.monto} onChange={f.campo('monto')} error={f.errores.monto} inputMode="decimal" />
        {v.metodo === 'efectivo'
          ? <Entrada etiqueta="Monto recibido" value={v.monto_recibido} onChange={f.campo('monto_recibido')} error={f.errores.monto_recibido} inputMode="decimal" placeholder="$0.00" />
          : <Entrada etiqueta="Referencia" value={v.referencia} onChange={f.campo('referencia')} error={f.errores.referencia} maxLength={60} placeholder="Autorización de la terminal" />}
      </div>
      {cambio != null && (
        <div className={`cambio${cambio < 0 ? ' falta' : ''}`}>
          <span>{cambio < 0 ? 'No alcanza: faltan' : 'Cambio a entregar'}</span><strong>{dinero(Math.abs(cambio))}</strong>
        </div>
      )}
      <Alerta>{f.error}</Alerta>
      <button className="boton boton-primario" disabled={f.enviando || !hayCaja}>{f.enviando ? 'Registrando…' : 'Registrar pago'}</button>
      <p className="texto-tenue">Para dividir la cuenta o pagar con dos métodos, registra varios pagos. Cuando los pagos cubren el total, la comanda {t.folio} se cierra, se genera el ticket y la Mesa {t.mesa} queda libre.</p>
      <button type="button" className="boton boton-secundario ancho" onClick={() => f.setValores({ ...inicial })}>Cancelar cobro</button>
    </form>
  );
}

function DialogoArqueo({ alCerrar }) {
  const [k, setK] = useState(null);
  const [error, setError] = useState(null);
  const [contado, setContado] = useState('');
  useEffect(() => { api.get('/caja/arqueo').then(setK).catch((e) => setError(e.message)); }, []);
  const diferencia = k && contado !== '' ? num(contado) - Number(k.efectivo_esperado) : null;
  return (
    <Dialogo titulo="Arqueo de caja" alCerrar={alCerrar} acciones={<button className="boton boton-primario compacto" onClick={alCerrar} data-foco>Listo</button>}>
      <Alerta>{error}</Alerta>
      {k && (
        <>
          <p className="texto-tenue">Corte {k.folio} · abierto a las {hora(k.abierto_en)}. Contar el cajón no cierra el corte: eso es el corte Z, en Cortes de caja.</p>
          <dl className="totales caja">
            <dt>Fondo inicial</dt><dd>{dinero(k.monto_apertura)}</dd>
            <dt>Efectivo cobrado ({contar(k.operaciones, 'pago')} en total)</dt><dd>{dinero(k.efectivo)}</dd>
            <dt>Tarjeta</dt><dd>{dinero(k.tarjeta)}</dd>
            <dt>Transferencia</dt><dd>{dinero(k.transferencia)}</dd>
            <dt className="total">Debe haber en el cajón</dt><dd className="total">{dinero(k.efectivo_esperado)}</dd>
          </dl>
          <Entrada etiqueta="Efectivo contado" value={contado} onChange={(e) => setContado(e.target.value)} inputMode="decimal" placeholder="$0.00" />
          {diferencia != null && (
            <div className={`cambio${diferencia < 0 ? ' falta' : ''}`}><span>{diferencia === 0 ? 'Cuadra' : diferencia < 0 ? 'Falta' : 'Sobra'}</span><strong>{dinero(Math.abs(diferencia))}</strong></div>
          )}
        </>
      )}
    </Dialogo>
  );
}
