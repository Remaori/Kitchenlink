// 03a · Reservaciones (hostess)
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../../api.js';
import { useCambios } from '../../tiempoReal.js';
import { ahora, useAhora } from '../../reloj.js';
import { contar, diaISO, fechaCorta, fechaLarga, hora } from '../../formato.js';
import { AvisoExito, Encabezado } from '../../componentes/Pagina.jsx';
import { Cargando, Explicacion, Insignia } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Entrada } from '../../componentes/Formulario.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { useAccion, useFormulario } from '../../usos.js';

/** Pestañas "Reservaciones (6)" y "Lista de espera (3)" */
export function PestanasRecepcion({ reservaciones, espera }) {
  const n = (x) => (x == null ? '' : ` (${x})`);
  return (
    <nav className="pestanas" aria-label="Secciones">
      <NavLink to="/reservaciones" className={({ isActive }) => (isActive ? 'activa' : '')}>Reservaciones{n(reservaciones)}</NavLink>
      <NavLink to="/lista-espera" className={({ isActive }) => (isActive ? 'activa' : '')}>Lista de espera{n(espera)}</NavLink>
    </nav>
  );
}

/** Botón "Hoy, 22 sep" que abre el calendario */
export function SelectorFecha({ valor, alCambiar }) {
  const esHoy = valor === diaISO(ahora());
  const f = new Date(`${valor}T12:00:00`);
  return (
    <label className="boton boton-secundario selector-fecha">
      <Ic.IconoCalendario width={17} height={17} />{esHoy ? `Hoy, ${fechaCorta(f)}` : fechaCorta(f)}
      <input type="date" value={valor} onChange={(e) => e.target.value && alCambiar(e.target.value)} aria-label="Fecha" />
    </label>
  );
}

const horaSugerida = (t) => `${String((t.getHours() + 2) % 24).padStart(2, '0')}:00`;
const sumarMin = (fechaHora, min) => new Date(new Date(fechaHora).getTime() + min * 60_000);

export default function Reservaciones() {
  const t = useAhora();
  const [fecha, setFecha] = useState(() => diaISO(ahora()));
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [editando, setEditando] = useState(null);
  const formulario = useRef(null);

  const cargar = useCallback(() => api.get(`/reservaciones?fecha=${fecha}`).then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), [fecha]);
  useEffect(() => { cargar(); }, [cargar]);
  useCambios(['reservaciones', 'espera', 'mesas'], cargar);
  const quitarAviso = useCallback(() => setAviso(null), []);
  const listo = (texto) => { setAviso(texto); setEditando(null); cargar(); };
  const accion = useAccion(listo);

  const nueva = () => { setEditando(null); formulario.current?.querySelector('input[name="nombre_cliente"]')?.focus(); };
  const c = datos?.configuracion;
  const r = datos?.resumen;

  return (
    <>
      <Encabezado titulo="Reservaciones" subtitulo={`Clientes que apartan mesa con anticipación · ${fechaLarga(new Date(`${fecha}T12:00:00`))}`}>
        <SelectorFecha valor={fecha} alCambiar={setFecha} />
        <button className="boton boton-primario compacto" onClick={nueva}><Ic.IconoMas width={17} height={17} />Nueva reservación</button>
      </Encabezado>

      <div className="contenido">
        <PestanasRecepcion reservaciones={r?.reservaciones} espera={r?.en_espera} />
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />
        <Alerta>{error || accion.error}</Alerta>
        {!datos && !error && <Cargando texto="Cargando la agenda…" />}

        {datos && (
          <>
            <div className="barra-parametros">
              <span><Ic.IconoReloj width={17} height={17} />Tolerancia de llegada: <strong>{c.tolerancia_min} min</strong></span>
              <span><Ic.IconoArena width={17} height={17} />Duración de la reservación: <strong>{c.duracion_min % 60 ? `${c.duracion_min} min` : `${c.duracion_min / 60} h`}</strong></span>
              <span><Ic.IconoCandado width={17} height={17} />La mesa se aparta: <strong>{c.apartado_previo_min} min antes</strong></span>
              <small>Se ajustan en Configuración</small>
            </div>

            <div className="recepcion-rejilla">
              <section className="tarjeta agenda">
                <div className="tarjeta-encabezado">
                  <div>
                    <h2>{fecha === diaISO(t) ? 'Agenda de hoy' : `Agenda del ${fechaCorta(new Date(`${fecha}T12:00:00`))}`}</h2>
                    <p className="tarjeta-sub">{contar(r.reservaciones, 'reservación', 'reservaciones')} · {contar(r.personas, 'persona')}</p>
                  </div>
                  <span className="ahora"><Ic.IconoReloj width={18} height={18} />Ahora: {hora(t)}</span>
                </div>
                <ul className="agenda-lista">
                  {datos.reservaciones.map((x) => (
                    <FilaReservacion key={x.id} r={x} t={t} accion={accion} elegida={editando?.id === x.id}
                      alEditar={() => setEditando(x)} />
                  ))}
                  {!datos.reservaciones.length && <li className="agenda-vacia">No hay reservaciones para este día.</li>}
                </ul>
                <Explicacion>Una reservación pasa de Por confirmar a Confirmada y luego a Sentada. Si el cliente no llega dentro de la tolerancia, cambia sola a No se presentó y la mesa se libera.</Explicacion>
              </section>

              <div ref={formulario}>
                <FormularioReservacion key={editando?.id ?? `nueva-${fecha}`} fecha={fecha} configuracion={c} reservacion={editando}
                  alTerminar={listo} alCancelarEdicion={() => setEditando(null)} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function FilaReservacion({ r, t, accion, elegida, alEditar }) {
  const terminada = ['no_se_presento', 'cancelada'].includes(r.estado_pantalla);
  const vigente = ['por_confirmar', 'confirmada'].includes(r.estado);
  let detalle; let tono = '';
  switch (r.estado_pantalla) {
    case 'no_se_presento': detalle = r.finalizada_en ? `Mesa liberada a las ${hora(r.finalizada_en)}` : `Se liberaba a las ${hora(r.tolerancia_hasta)}`; break;
    case 'sentada': detalle = `Llegó ${hora(r.sentada_en)} · ocupada hasta ${hora(r.apartado_hasta)}`; break;
    case 'en_tolerancia': detalle = `Faltan ${Math.max(0, Math.ceil((new Date(r.tolerancia_hasta) - t) / 60_000))} min · se libera a las ${hora(r.tolerancia_hasta)}`; tono = 'ambar'; break;
    case 'confirmada': detalle = new Date(r.apartado_desde) <= t ? `Mesa apartada desde las ${hora(r.apartado_desde)}` : `La mesa se apartará a las ${hora(r.apartado_desde)}`; break;
    case 'por_confirmar': detalle = r.telefono ? `Llamar al ${r.telefono}` : 'Sin teléfono: confirmar al llegar'; break;
    case 'cancelada': detalle = 'Cancelada'; break;
    default: detalle = '';
  }
  const hacer = (ruta, texto) => accion.hacer(() => api.post(`/reservaciones/${r.id}/${ruta}`), texto);
  return (
    <li className={`agenda-fila ${r.estado_pantalla === 'en_tolerancia' ? 'resaltada' : ''} ${terminada ? 'apagada' : ''} ${elegida ? 'elegida' : ''}`}>
      <span className="agenda-hora">{hora(r.fecha_hora)}</span>
      <div className="agenda-cliente">
        {vigente ? <button type="button" className="agenda-nombre" onClick={alEditar} title="Editar o cancelar">{r.nombre_cliente}</button>
          : <strong className="agenda-nombre">{r.nombre_cliente}</strong>}
        <small>{[contar(r.numero_personas, 'persona'), `Mesa ${r.mesa}`, r.solicitudes_especiales].filter(Boolean).join(' · ')}</small>
      </div>
      <div className="agenda-estado">
        <Insignia tono={r.estado_tono}>{r.estado_etiqueta}</Insignia>
        <small className={tono}>{detalle}</small>
      </div>
      <div className="agenda-accion">
        {r.estado === 'por_confirmar' && r.estado_pantalla !== 'no_se_presento' && (
          r.estado_pantalla === 'en_tolerancia'
            ? <button className="boton boton-suave boton-chico" disabled={accion.enviando} onClick={() => hacer('llegada', `${r.nombre_cliente} llegó: la Mesa ${r.mesa} queda Por atender.`)}>Marcar llegada</button>
            : <button className="boton boton-secundario boton-chico" disabled={accion.enviando} onClick={() => hacer('confirmar', `Se confirmó la reservación de ${r.nombre_cliente}.`)}>Confirmar</button>
        )}
        {r.estado === 'confirmada' && r.estado_pantalla !== 'no_se_presento' && (
          <button className={`boton boton-chico ${r.estado_pantalla === 'en_tolerancia' ? 'boton-suave' : 'boton-secundario'}`} disabled={accion.enviando}
            onClick={() => hacer('llegada', `${r.nombre_cliente} llegó: la Mesa ${r.mesa} queda Por atender.`)}>Marcar llegada</button>
        )}
        {r.estado_pantalla === 'no_se_presento' && !r.paso_a_lista && r.estado !== 'cancelada' && (
          <button className="enlace gris" disabled={accion.enviando} title="Llegó tarde: si todavía quiere mesa, entra a la lista de espera"
            onClick={() => accion.hacer(() => api.post(`/reservaciones/${r.id}/lista-espera`), `${r.nombre_cliente} pasó a la lista de espera.`)}>Llegó tarde</button>
        )}
        {r.paso_a_lista && <small className="texto-tenue">En lista de espera</small>}
      </div>
    </li>
  );
}

function FormularioReservacion({ fecha, configuracion: c, reservacion, alTerminar, alCancelarEdicion }) {
  const editar = !!reservacion;
  const inicial = editar
    ? { fecha: diaISO(reservacion.fecha_hora), hora: hora(reservacion.fecha_hora), numero_personas: reservacion.numero_personas, mesa_id: String(reservacion.mesa_id),
      nombre_cliente: reservacion.nombre_cliente, telefono: reservacion.telefono ?? '', solicitudes_especiales: reservacion.solicitudes_especiales ?? '' }
    : { fecha, hora: horaSugerida(ahora()), numero_personas: 4, mesa_id: '', nombre_cliente: '', telefono: '', solicitudes_especiales: '' };
  const f = useFormulario(inicial,
    (v) => (editar ? api.put(`/reservaciones/${reservacion.id}`, v) : api.post('/reservaciones', v)),
    (r) => {
      alTerminar(editar ? `Se guardaron los cambios de la reservación de ${r.nombre_cliente}.`
        : `Se registró la reservación de ${r.nombre_cliente} (Mesa ${r.mesa}, ${hora(r.fecha_hora)}). Queda Por confirmar.`);
      if (!editar) f.setValores({ ...inicial });
    });
  const cancelar = useAccion(alTerminar);
  const [mesas, setMesas] = useState([]);
  const { valores: v } = f;

  // Mesas que sirven para esa fecha, hora y personas
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha) || !/^\d{2}:\d{2}$/.test(v.hora)) return;
    const q = new URLSearchParams({ fecha: v.fecha, hora: v.hora, personas: v.numero_personas || 1, ...(editar ? { excepto: reservacion.id } : {}) });
    api.get(`/reservaciones/mesas?${q}`).then((m) => {
      setMesas(m);
      const sirve = (x) => x.cabe && !x.choca_con;
      if (!m.some((x) => String(x.id) === v.mesa_id && sirve(x))) f.setValores((x) => ({ ...x, mesa_id: String(m.find(sirve)?.id ?? '') }));
    }).catch(() => setMesas([]));
  }, [v.fecha, v.hora, v.numero_personas]); // eslint-disable-line react-hooks/exhaustive-deps

  const mesa = mesas.find((m) => String(m.id) === v.mesa_id);
  const cuando = /^\d{2}:\d{2}$/.test(v.hora) ? new Date(`${v.fecha}T${v.hora}:00`) : null;
  return (
    <form className="tarjeta formulario-reservacion" onSubmit={f.guardar} noValidate>
      <h2>{editar ? `Reservación de ${reservacion.nombre_cliente}` : 'Nueva reservación'}</h2>
      <p className="tarjeta-sub">{editar ? `${reservacion.estado_etiqueta} · cambia la hora, la mesa o los datos` : 'Captura los datos del cliente'}</p>
      <div className="rejilla-campos">
        <Entrada etiqueta="Fecha" type="date" value={v.fecha} onChange={f.campo('fecha')} error={f.errores.fecha} />
        <Entrada etiqueta="Hora" type="time" value={v.hora} onChange={f.campo('hora')} error={f.errores.hora} step={300} />
        <Entrada etiqueta="Personas" type="number" min={1} max={30} value={v.numero_personas} onChange={f.campo('numero_personas')}
          error={f.errores.numero_personas} icono={<Ic.IconoPersonas width={18} height={18} />} />
        <div className="campo-form">
          <label htmlFor="mesa-reservacion">Mesa</label>
          <select id="mesa-reservacion" className="selector" value={v.mesa_id} onChange={f.campo('mesa_id')} aria-invalid={!!f.errores.mesa_id}>
            <option value="">Elige…</option>
            {mesas.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.cabe || !!m.choca_con}>
                Mesa {m.numero}{!m.cabe ? ` · ${m.capacidad} lugares` : m.choca_con ? ` · apartada para ${m.choca_con}` : ''}
              </option>
            ))}
          </select>
          {f.errores.mesa_id && <p className="campo-error">{f.errores.mesa_id}</p>}
        </div>
        <Entrada etiqueta="Nombre" obligatorio name="nombre_cliente" value={v.nombre_cliente} onChange={f.campo('nombre_cliente')} error={f.errores.nombre_cliente} maxLength={120} />
        <Entrada etiqueta="Teléfono" value={v.telefono} onChange={f.campo('telefono')} error={f.errores.telefono} maxLength={20} inputMode="tel"
          icono={<Ic.IconoTelefono width={18} height={18} />} />
        <div className="campo-form ancho-completo">
          <label htmlFor="solicitudes">Solicitudes especiales</label>
          <textarea id="solicitudes" className="area-texto" rows={3} value={v.solicitudes_especiales} onChange={f.campo('solicitudes_especiales')}
            maxLength={300} placeholder="Alergias, ocasión especial, silla para bebé…" />
        </div>
      </div>

      {mesa && cuando && (
        <div className="aviso-apartado">
          <strong><Ic.IconoCandado width={17} height={17} />Mesa {mesa.numero} quedará apartada de {hora(sumarMin(cuando, -c.apartado_previo_min))} a {hora(sumarMin(cuando, c.duracion_min))}</strong>
          <span>Si no llegan antes de las {hora(sumarMin(cuando, c.tolerancia_min))}, la reservación pasa sola a No se presentó y la mesa se libera.</span>
        </div>
      )}
      <Alerta>{f.error || cancelar.error}</Alerta>
      <button className="boton boton-primario" disabled={f.enviando}>{f.enviando ? 'Guardando…' : editar ? 'Guardar cambios' : 'Registrar reservación'}</button>
      {editar && (
        <div className="botones-edicion">
          <button type="button" className="enlace gris" onClick={alCancelarEdicion}>Volver a nueva reservación</button>
          <button type="button" className="enlace peligro" disabled={cancelar.enviando}
            onClick={() => cancelar.hacer(() => api.post(`/reservaciones/${reservacion.id}/cancelar`), `Se canceló la reservación de ${reservacion.nombre_cliente}.`)}>
            Cancelar reservación</button>
        </div>
      )}
    </form>
  );
}
