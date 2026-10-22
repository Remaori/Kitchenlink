// 03b · Lista de espera (hostess)
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useCambios } from '../../tiempoReal.js';
import { minutosDesde, useAhora } from '../../reloj.js';
import { contar, hora } from '../../formato.js';
import { AvisoExito, Encabezado } from '../../componentes/Pagina.jsx';
import { Cargando, Explicacion, Insignia } from '../../componentes/Piezas.jsx';
import { Alerta } from '../../componentes/Campos.jsx';
import { Entrada } from '../../componentes/Formulario.jsx';
import * as Ic from '../../componentes/Iconos.jsx';
import { useAccion, useFormulario } from '../../usos.js';
import { PestanasRecepcion } from './Reservaciones.jsx';

/**
 * Mesas para un grupo, en el orden de la regla de la pantalla 12: primero las
 * libres de su tamaño sin reservación próxima; luego las libres que tienen una
 * más tarde ("solo si terminan antes"); las apartadas y las chicas no se ofrecen.
 */
export function mesasParaGrupo(mesas, personas) {
  const fila = (m) => {
    if (m.estado === 'reservada') {
      return { m, orden: 3, disponible: false, texto: `Para ${m.proxima_reservacion} (${hora(m.proxima_reservacion_hora)}). Se libera a las ${hora(m.se_libera_si_no_llega)} si no llega` };
    }
    if (m.capacidad < personas) return { m, orden: 4, disponible: false, texto: `Muy pequeña para ${contar(personas, 'persona')}` };
    if (m.proxima_reservacion) {
      return { m, orden: 2, disponible: true, aviso: true, texto: `Tiene reservación a las ${hora(m.proxima_reservacion_hora)}: solo si terminan antes` };
    }
    return { m, orden: 1, disponible: true, texto: `Libre desde las ${hora(m.libre_desde)} · sin reservaciones próximas` };
  };
  return mesas.filter((m) => ['libre', 'reservada'].includes(m.estado)).map(fila)
    .sort((a, b) => a.orden - b.orden || a.m.capacidad - b.m.capacidad || a.m.numero.localeCompare(b.m.numero))
    .slice(0, 6);
}

export default function ListaEspera() {
  const t = useAhora();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [elegido, setElegido] = useState(null);
  const formulario = useRef(null);

  const cargar = useCallback(() => api.get('/lista-espera').then((d) => { setDatos(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  useCambios(['espera', 'reservaciones', 'mesas', 'comandas'], cargar);
  const quitarAviso = useCallback(() => setAviso(null), []);
  const listo = (texto) => { setAviso(texto); cargar(); };
  const accion = useAccion(listo);

  const espera = datos?.espera ?? [];
  const grupo = espera.find((g) => g.id === elegido) ?? espera[0];
  const f = useFormulario({ nombre_cliente: '', numero_personas: '', telefono: '', nota: '', espera_estimada_min: '' },
    (v) => api.post('/lista-espera', v),
    (g) => { f.setValores({ nombre_cliente: '', numero_personas: '', telefono: '', nota: '', espera_estimada_min: '' }); listo(`${g.nombre_cliente} quedó en la lista de espera.`); });
  const agregar = () => formulario.current?.querySelector('input')?.focus();

  return (
    <>
      <Encabezado titulo="Lista de espera" subtitulo="Clientes que llegan sin reservación y esperan una mesa libre">
        <button className="boton boton-primario compacto" onClick={agregar}><Ic.IconoMas width={17} height={17} />Agregar a la lista</button>
      </Encabezado>

      <div className="contenido">
        <PestanasRecepcion reservaciones={datos?.reservaciones_hoy} espera={datos ? espera.length : undefined} />
        <AvisoExito texto={aviso} alTerminar={quitarAviso} />
        <Alerta>{error || accion.error}</Alerta>
        {!datos && !error && <Cargando texto="Cargando la lista…" />}

        {datos && (
          <>
            <div className="barra-parametros">
              <span className="sin-borde"><Ic.IconoInfo width={17} height={17} />Una reservación aparta una mesa para una hora futura. La lista de espera ordena a quien ya llegó y no encontró mesa libre.</span>
              <strong className="promedio"><Ic.IconoReloj width={18} height={18} />Espera promedio hoy: {datos.espera_promedio_hoy_min == null ? '—' : `${datos.espera_promedio_hoy_min} min`}</strong>
            </div>

            <div className="recepcion-rejilla espera">
              <section className="tarjeta">
                <div className="tarjeta-encabezado">
                  <div>
                    <h2>En espera ahora</h2>
                    <p className="tarjeta-sub">Por orden de llegada, siempre que la mesa sea del tamaño adecuado</p>
                  </div>
                  <Insignia tono="warn">{contar(espera.length, 'grupo')}</Insignia>
                </div>
                <ul className="espera-lista">
                  {espera.map((g) => {
                    const min = minutosDesde(g.llegada_en, t);
                    const estimado = g.espera_estimada_min == null ? null : Math.max(0, g.espera_estimada_min - min);
                    return (
                      <li key={g.id} className={g.id === grupo?.id ? 'elegido' : ''}>
                        <button type="button" className="espera-grupo" onClick={() => setElegido(g.id)} aria-pressed={g.id === grupo?.id}>
                          <span className="posicion">{g.posicion}</span>
                          <span className="espera-datos">
                            <strong>{g.nombre_cliente}{g.venia_con_reservacion && <Insignia tono="info" className="chica">Venía con reservación</Insignia>}</strong>
                            <small>{[contar(g.numero_personas, 'persona'), g.nota && !g.venia_con_reservacion ? g.nota.toLowerCase() : null, g.telefono].filter(Boolean).join(' · ')}</small>
                          </span>
                          <span className="espera-tiempo">
                            <strong><Ic.IconoReloj width={17} height={17} />Esperando {min} min</strong>
                            <small>{estimado == null ? 'Sin estimado' : `Estimado: mesa en ~${estimado} min`}</small>
                          </span>
                        </button>
                        <button className="boton boton-secundario boton-chico" disabled={accion.enviando}
                          onClick={() => accion.hacer(() => api.post(`/lista-espera/${g.id}/retirar`), `${g.nombre_cliente} se retiró de la lista.`)}>Retirar</button>
                      </li>
                    );
                  })}
                  {!espera.length && <li className="agenda-vacia">Nadie está esperando mesa.</li>}
                </ul>

                <form className="agregar-espera" ref={formulario} onSubmit={f.guardar} noValidate>
                  <h3>Agregar a la lista de espera</h3>
                  <div className="agregar-espera-campos">
                    <Entrada etiqueta="Nombre" value={f.valores.nombre_cliente} onChange={f.campo('nombre_cliente')} error={f.errores.nombre_cliente}
                      placeholder="Nombre del cliente" maxLength={120} />
                    <Entrada etiqueta="Personas" type="number" min={1} max={30} value={f.valores.numero_personas} onChange={f.campo('numero_personas')}
                      error={f.errores.numero_personas} placeholder="0" icono={<Ic.IconoPersonas width={18} height={18} />} />
                    <Entrada etiqueta="Teléfono (opcional)" value={f.valores.telefono} onChange={f.campo('telefono')} error={f.errores.telefono}
                      placeholder="Para avisarle" inputMode="tel" icono={<Ic.IconoTelefono width={18} height={18} />} />
                    <button className="boton boton-primario compacto" disabled={f.enviando}><Ic.IconoMas width={17} height={17} />Agregar</button>
                  </div>
                  <div className="agregar-espera-opcional">
                    <Entrada etiqueta="Nota (opcional)" value={f.valores.nota} onChange={f.campo('nota')} error={f.errores.nota} maxLength={160}
                      placeholder="Ej. necesita mesa de 6, silla para bebé" />
                    <Entrada etiqueta="Espera estimada (min)" type="number" min={0} max={240} value={f.valores.espera_estimada_min}
                      onChange={f.campo('espera_estimada_min')} error={f.errores.espera_estimada_min} placeholder="Ej. 20" />
                  </div>
                  <Alerta>{f.error}</Alerta>
                </form>
              </section>

              {grupo ? <AsignarMesa grupo={grupo} mesas={datos.mesas} t={t} alTerminar={listo} /> : (
                <section className="tarjeta"><h2>Asignar mesa</h2><p className="tarjeta-sub">Cuando alguien espere, aquí aparecen las mesas que le sirven.</p></section>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function AsignarMesa({ grupo, mesas, t, alTerminar }) {
  const accion = useAccion(alTerminar);
  const opciones = mesasParaGrupo(mesas, grupo.numero_personas);
  const primera = opciones.find((o) => o.disponible && !o.aviso);
  return (
    <section className="tarjeta asignar-mesa">
      <h2>Asignar mesa a {grupo.nombre_cliente}</h2>
      <p className="tarjeta-sub">{contar(grupo.numero_personas, 'persona')} · esperando {minutosDesde(grupo.llegada_en, t)} min</p>
      <ul>
        {opciones.map(({ m, disponible, aviso, texto }) => (
          <li key={m.id} className={disponible ? '' : 'apagada'}>
            <Ic.IconoMesa width={18} height={18} />
            <div className="asignar-datos">
              <strong>Mesa {m.numero} · {contar(m.capacidad, 'lugar', 'lugares')}</strong>
              <small className={aviso ? 'ambar' : ''}>{texto}</small>
            </div>
            <div className="asignar-accion">
              <Insignia tono={m.estado_tono}>{m.estado_etiqueta}</Insignia>
              {disponible ? (
                <button className={`boton boton-chico ${m === primera?.m ? 'boton-morado' : 'boton-secundario'}`} disabled={accion.enviando}
                  onClick={() => accion.hacer(() => api.post(`/lista-espera/${grupo.id}/asignar`, { mesa_id: m.id }),
                    `${grupo.nombre_cliente} pasó a la Mesa ${m.numero}: queda Por atender para que el mesero abra la comanda.`)}>Asignar</button>
              ) : <small className="texto-tenue">No disponible</small>}
            </div>
          </li>
        ))}
        {!opciones.length && <li className="agenda-vacia">No hay mesas libres en este momento.</li>}
      </ul>
      <Alerta>{accion.error}</Alerta>
      <Explicacion tono="morado">Regla: cuando se libera una mesa, primero se revisa si tiene una reservación próxima. Solo si no la tiene, se ofrece al primero de la lista de espera que quepa.</Explicacion>
    </section>
  );
}
