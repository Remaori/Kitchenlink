// 10 · Supervisión y reportes (gerente)
import { useCallback, useEffect, useState } from 'react';
import { api, descargar } from '../../api.js';
import { useCambios } from '../../tiempoReal.js';
import { ahora } from '../../reloj.js';
import { contar, diaISO, dinero, duracion, fechaCorta, hora } from '../../formato.js';
import { Encabezado } from '../../componentes/Pagina.jsx';
import { Cargando, Fichas, Insignia } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { SelectorFecha } from '../recepcion/Reservaciones.jsx';

const NIVEL = { Óptimo: 'ok', Alto: 'warn', Crítico: 'bad' };
const fechaLargaAnio = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

/** "+12.4 % vs. ayer": verde si sube, rojo si baja (para las cancelaciones, al revés) */
function Comparacion({ hoy, ayer, porcentaje = true, menosEsMejor = false }) {
  const a = Number(ayer ?? 0); const h = Number(hoy ?? 0);
  if (!a) return <span className="indicador-detalle">Sin datos de ayer</span>;
  const cambio = porcentaje ? ((h - a) / a) * 100 : h - a;
  const sube = cambio >= 0;
  const bueno = menosEsMejor ? !sube : sube;
  const texto = `${sube ? '+' : '−'}${Math.abs(cambio).toFixed(1)}${porcentaje ? ' %' : ''} vs. ayer`;
  return <span className={`indicador-detalle ${bueno ? 'sube' : 'baja'}`}>{sube ? '↑' : '↓'} {texto}</span>;
}

export default function Reportes() {
  const [fecha, setFecha] = useState(() => diaISO(ahora()));
  const [periodo, setPeriodo] = useState('dia');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => api.get(`/reportes?fecha=${fecha}&periodo=${periodo}`).then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), [fecha, periodo]);
  useEffect(() => { cargar(); }, [cargar]);
  useCambios(['caja', 'comandas'], cargar, { respaldoMs: 60_000 });

  const h = datos?.hoy; const a = datos?.ayer;
  return (
    <>
      <Encabezado titulo="Supervisión y reportes" subtitulo={`Resumen operativo del ${fechaLargaAnio(fecha)}`}>
        <SelectorFecha valor={fecha} alCambiar={setFecha} />
        <button className="boton boton-primario compacto" onClick={() => descargar(`/reportes/exportar?fecha=${fecha}`, `reporte-${fecha}.csv`).catch((e) => setError(e.message))}>
          <Ic.IconoDescarga width={17} height={17} />Exportar reporte</button>
      </Encabezado>
      <div className="contenido">
        <Alerta>{error}</Alerta>
        {!datos && !error && <Cargando />}
        {datos && (
          <>
            <div className="indicadores">
              <div className="indicador"><span className="indicador-titulo">Ventas del día</span><strong className="indicador-valor">{dinero(h.ventas)}</strong><Comparacion hoy={h.ventas} ayer={a.ventas} /></div>
              <div className="indicador"><span className="indicador-titulo">Comensales atendidos</span><strong className="indicador-valor">{h.comensales}</strong><Comparacion hoy={h.comensales} ayer={a.comensales} /></div>
              <div className="indicador"><span className="indicador-titulo">Ticket promedio</span><strong className="indicador-valor">{h.ticket_promedio ? dinero(h.ticket_promedio) : '—'}</strong><Comparacion hoy={h.ticket_promedio} ayer={a.ticket_promedio} /></div>
              <div className="indicador"><span className="indicador-titulo">Rotación de mesas</span><strong className="indicador-valor">{h.rotacion_veces ? `${h.rotacion_veces} veces` : '—'}</strong><Comparacion hoy={h.rotacion_veces} ayer={a.rotacion_veces} porcentaje={false} /></div>
              <div className="indicador"><span className="indicador-titulo">Cancelaciones</span><strong className="indicador-valor">{dinero(h.monto_cancelado)}</strong>
                <span className={`indicador-detalle ${h.cancelaciones ? 'baja' : ''}`}>{contar(h.cancelaciones, 'cancelación', 'cancelaciones')}</span></div>
            </div>

            <div className="reportes-rejilla">
              <section className="tarjeta grafica">
                <div className="tarjeta-encabezado">
                  <div><h2>Ventas por {periodo === 'dia' ? 'hora' : 'día'}</h2><p className="tarjeta-sub">{periodo === 'dia' ? 'Comportamiento de ventas durante el servicio' : periodo === 'semana' ? 'Los 7 días hasta la fecha elegida' : 'Del 1 del mes a la fecha elegida'}</p></div>
                  <Fichas valor={periodo} alCambiar={setPeriodo} etiqueta="Periodo" opciones={[['dia', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']]} />
                </div>
                <Columnas barras={datos.ventas} periodo={periodo} />
              </section>

              <section className="tarjeta top-productos">
                <h2>Ventas por producto</h2>
                <p className="tarjeta-sub">Top 5 del día</p>
                <ul>
                  {datos.productos.map((p) => (
                    <li key={p.nombre_producto}>
                      <div><strong>{p.nombre_producto}</strong><span>{dinero(p.importe)}</span></div>
                      <small>{contar(p.vendidos, 'vendido')}</small>
                      <span className="medidor" aria-hidden="true"><span style={{ width: `${(Number(p.importe) / Number(datos.productos[0].importe)) * 100}%` }} /></span>
                    </li>
                  ))}
                  {!datos.productos.length && <li className="agenda-vacia">Todavía no hay ventas este día.</li>}
                </ul>
              </section>

              <section className="tarjeta cancelaciones">
                <div className="tarjeta-encabezado">
                  <div><h2>Reporte de cancelaciones</h2><p className="tarjeta-sub">Productos cancelados durante el servicio</p></div>
                  <Insignia tono={datos.cancelaciones.length ? 'bad' : 'gray'}>{datos.cancelaciones.length} hoy</Insignia>
                </div>
                <table className="tabla sencilla">
                  <thead><tr><th>Producto</th><th>Mesa</th><th>Motivo</th><th>Pidió · autorizó</th><th className="num">Monto</th><th>Hora</th></tr></thead>
                  <tbody>
                    {datos.cancelaciones.map((k) => (
                      <tr key={k.id}>
                        <td>{k.producto ? `${k.cantidad > 1 ? `${k.cantidad}× ` : ''}${k.producto}` : `Comanda ${k.comanda}`}</td>
                        <td>Mesa {k.mesa}</td><td className="celda-doble">{k.motivo}</td>
                        <td className="texto-gris">{k.solicito.split(' ')[0]} · {k.autorizo.split(' ')[0]}</td>
                        <td className="num">{dinero(k.monto)}</td><td>{hora(k.hora)}</td>
                      </tr>
                    ))}
                    {!datos.cancelaciones.length && <tr><td colSpan={6} className="tabla-vacia">Sin cancelaciones este día.</td></tr>}
                  </tbody>
                </table>
              </section>

              <section className="tarjeta rotacion">
                <h2>Tiempo de rotación de mesas</h2>
                <p className="tarjeta-sub">Promedio por mesa en el servicio</p>
                <ul>
                  {datos.rotacion.map((x) => (
                    <li key={x.mesa}>
                      <Ic.IconoMesa width={18} height={18} /><strong>Mesa {x.mesa}</strong>
                      <span className="texto-gris">{duracion(x.minutos_promedio)}{x.servicios > 1 ? ` · ${x.servicios} servicios` : ''}</span>
                      <Insignia tono={NIVEL[x.nivel]}>{x.nivel}</Insignia>
                    </li>
                  ))}
                  {!datos.rotacion.length && <li className="agenda-vacia">Ninguna mesa ha terminado un servicio este día.</li>}
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// Escala "limpia" para el eje: 0, 500, 1,000… (siempre con la barra más alta adentro)
function escala(max) {
  if (max <= 0) return [0, 1];
  const paso = 10 ** Math.floor(Math.log10(max));
  const tope = [1, 2, 2.5, 5, 10].map((m) => m * paso).find((t) => t >= max);
  return [0, tope];
}

/** Columnas de ventas (una serie: sin leyenda; el título dice qué es). Pasa el cursor para ver el detalle. */
function Columnas({ barras, periodo }) {
  const [activa, setActiva] = useState(null);
  const [tabla, setTabla] = useState(false);
  const valores = barras.map((b) => Number(b.ventas));
  const [, tope] = escala(Math.max(...valores, 0));
  const maximo = Math.max(...valores);
  const etiqueta = (b) => (periodo === 'dia' ? `${b.etiqueta} h` : fechaCorta(new Date(`${b.etiqueta}T12:00:00`)));
  const ticks = [0, tope / 2, tope];
  if (tabla) {
    return (
      <>
        <table className="tabla sencilla"><thead><tr><th>{periodo === 'dia' ? 'Hora' : 'Día'}</th><th className="num">Ventas</th><th className="num">Tickets</th></tr></thead>
          <tbody>{barras.map((b) => <tr key={b.etiqueta}><td>{etiqueta(b)}</td><td className="num">{dinero(b.ventas)}</td><td className="num">{b.tickets}</td></tr>)}</tbody></table>
        <button className="enlace" onClick={() => setTabla(false)}>Ver como gráfica</button>
      </>
    );
  }
  return (
    <>
      <div className="columnas" role="img" aria-label={`Ventas por ${periodo === 'dia' ? 'hora' : 'día'}; la más alta: ${dinero(maximo)}`}>
        <div className="columnas-eje">{[...ticks].reverse().map((t) => <span key={t}>{dinero(t).replace('.00', '')}</span>)}</div>
        <div className="columnas-area" onMouseLeave={() => setActiva(null)}>
          {ticks.map((t) => <span key={t} className="columnas-guia" style={{ bottom: `${(t / tope) * 100}%` }} />)}
          {barras.map((b, i) => {
            const v = Number(b.ventas);
            return (
              <div key={b.etiqueta} className={`columna${activa === i ? ' activa' : ''}`} onMouseEnter={() => setActiva(i)} onFocus={() => setActiva(i)} tabIndex={0}
                aria-label={`${etiqueta(b)}: ${dinero(v)}, ${contar(b.tickets, 'ticket')}`}>
                <span className="columna-barra" style={{ height: `${(v / tope) * 100}%` }}>
                  {v === maximo && v > 0 && <span className="columna-valor">{dinero(v).replace('.00', '')}</span>}
                </span>
                {activa === i && (
                  <span className="columna-tooltip"><strong>{etiqueta(b)}</strong>{dinero(v)}<small>{contar(b.tickets, 'ticket')}</small></span>
                )}
              </div>
            );
          })}
        </div>
        <div className="columnas-etiquetas">{barras.map((b, i) => <span key={b.etiqueta}>{periodo === 'mes' && i % 3 && i !== barras.length - 1 ? '' : etiqueta(b)}</span>)}</div>
      </div>
      <button className="enlace ver-tabla" onClick={() => setTabla(true)}>Ver como tabla</button>
    </>
  );
}
